import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthResponse } from './auth.interfaces';
import { SessionsService } from './sessions.service';
import { UserResponse, User } from '../users/users.interfaces';
import { CreateUserDto } from './create-user.dto';
import { LoginUserDto } from './login-user.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';
import { API_ERROR_CODES, codedError } from '../common/api-errors';
import { AuthLimitsService } from './auth-limits.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
    private readonly sessions: SessionsService,
    private readonly limits: AuthLimitsService,
  ) {}

  private toUserResponse(user: User): UserResponse {
    const { password, roles, ...userResponse } = user;
    void password;
    return {
      ...userResponse,
      roles: roles?.map((userRole) => userRole.role) ?? [],
    };
  }

  async findOne(id: number): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toUserResponse(user);
  }

  async register(data: CreateUserDto): Promise<AuthResponse> {
    const hashedPassword = await argon2.hash(data.password);
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: data.email,
      },
    });

    if (existingUser) {
      throw new ConflictException(
        codedError(
          new ConflictException('Email already in use'),
          API_ERROR_CODES.emailAlreadyInUse,
        ),
      );
    }

    const userRole = await this.rolesService
      .findByKey('USER')
      .catch(() => null);

    if (!userRole) {
      throw new InternalServerErrorException('Default user role not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          username: data.username,
          email: data.email,
          password: hashedPassword,
          bio: data.bio,
          avatar: data.avatar,
        },
      });

      await tx.userRole.create({
        data: {
          userId: createdUser.id,
          roleId: userRole.id,
        },
      });

      return this.sessions.create(createdUser.id, tx);
    });
  }

  async login(data: LoginUserDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: data.login }, { username: data.login }],
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    const identity = user
      ? `user:${user.id}`
      : `login:${data.login.trim().toLowerCase()}`;
    return this.limits.login(identity, async (tx) => {
      if (
        !user?.isActive ||
        !(await argon2.verify(user.password, data.password))
      )
        return null;
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      try {
        return await this.sessions.create(user.id, tx);
      } catch (error) {
        if (error instanceof UnauthorizedException) return null;
        throw error;
      }
    });
  }
}
