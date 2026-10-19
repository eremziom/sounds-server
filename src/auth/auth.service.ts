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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
    private readonly sessions: SessionsService,
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
      throw new ConflictException('Email already in use');
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

    if (!user?.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await argon2.verify(user.password, data.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
      data: {
        lastLoginAt: new Date(),
      },
    });

    return this.sessions.create(user.id);
  }
}
