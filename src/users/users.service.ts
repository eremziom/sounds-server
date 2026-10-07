import { Injectable, NotFoundException } from '@nestjs/common';
import { UserResponse, User, UserRole } from './users.interfaces';
import { PrismaService } from '../prisma/prisma.service';

type UpdatableUserFields = Pick<User, 'username' | 'bio' | 'avatar'>;
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A private helper function to convert a User object
   * into a UserResponse object. This function is used
   * internally by the UsersService to return UserResponse
   * objects from functions that return User objects.
   */
  private toUserResponse(user: User): UserResponse {
    const { password, roles, ...userResponse } = user;
    void password;
    return {
      ...userResponse,
      roles: roles?.map((userRole) => userRole.role) ?? [],
    };
  }
  async findAll(): Promise<UserResponse[]> {
    const users = await this.prisma.user.findMany({
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
      orderBy: {
        id: 'asc',
      },
    });

    return users.map((user) => this.toUserResponse(user));
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

  async remove(id: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({
      where: { id },
    });
  }

  async update(
    id: number,
    data: Partial<UpdatableUserFields>,
  ): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
      data: {
        ...(data.username !== undefined && { username: data.username }),
        ...(data.bio !== undefined && { bio: data.bio }),
        ...(data.avatar !== undefined && { avatar: data.avatar }),
      },
    });

    return this.toUserResponse(updatedUser);
  }

  async updateRole(id: number, role: UserRole): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const targetRole = await this.prisma.role.findUnique({
      where: {
        key: role,
      },
    });

    if (!targetRole) {
      throw new NotFoundException('Role not found');
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: {
          userId: id,
        },
      });

      await tx.userRole.create({
        data: {
          userId: id,
          roleId: targetRole.id,
        },
      });

      return tx.user.findUnique({
        where: { id },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });
    });

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    return this.toUserResponse(updatedUser);
  }

  async updateActive(id: number, isActive: boolean): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
      data: {
        isActive,
      },
    });

    return this.toUserResponse(updatedUser);
  }
}
