import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserResponse, User } from '../users/users.interfaces';
import { CreateUserDto } from './create-user.dto';
import { LoginUserDto } from './login-user.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

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

  async register(data: CreateUserDto): Promise<UserResponse> {
    const hashedPassword = await argon2.hash(data.password);
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: data.email,
      },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const userRole = await this.prisma.role.findUnique({
      where: {
        key: 'USER',
      },
    });

    if (!userRole) {
      throw new InternalServerErrorException('Default user role not found');
    }

    const newUser = await this.prisma.$transaction(async (tx) => {
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

      return {
        ...createdUser,
        roles: [{ role: userRole }],
      };
    });

    return this.toUserResponse(newUser);
  }

  async login(data: LoginUserDto): Promise<UserResponse> {
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

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await argon2.verify(user.password, data.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const updatedUser = await this.prisma.user.update({
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

    return this.toUserResponse(updatedUser);
  }
}
