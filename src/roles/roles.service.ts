import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateRoleData,
  Role,
  RolePermissionAssignment,
  RoleWithPermissions,
  UpdateRoleData,
} from './roles.interfaces';
import { PrismaService } from '../prisma/prisma.service';

type RoleWithPermissionAssignments = Role & {
  permissions: RolePermissionAssignment[];
};

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  private toRoleWithPermissions(
    role: RoleWithPermissionAssignments,
  ): RoleWithPermissions {
    return {
      ...role,
      permissions: role.permissions.map(
        (rolePermission) => rolePermission.permission,
      ),
    };
  }

  async findAll(): Promise<RoleWithPermissions[]> {
    const roles = await this.prisma.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: {
        id: 'asc',
      },
    });

    return roles.map((role) => this.toRoleWithPermissions(role));
  }

  async findOne(id: number): Promise<RoleWithPermissions> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return this.toRoleWithPermissions(role);
  }

  async findByKey(key: string): Promise<Role> {
    const role = await this.prisma.role.findUnique({
      where: { key },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  async create(data: CreateRoleData): Promise<RoleWithPermissions> {
    const role = await this.prisma.role.create({
      data,
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return this.toRoleWithPermissions(role);
  }

  async update(id: number, data: UpdateRoleData): Promise<RoleWithPermissions> {
    await this.findOne(id);

    const role = await this.prisma.role.update({
      where: { id },
      data,
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return this.toRoleWithPermissions(role);
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);

    await this.prisma.role.delete({
      where: { id },
    });
  }

  async assignPermission(
    roleId: number,
    permissionId: number,
  ): Promise<RoleWithPermissions> {
    await this.findOne(roleId);

    const permission = await this.prisma.permission.findUnique({
      where: { id: permissionId },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    await this.prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId,
          permissionId,
        },
      },
      update: {},
      create: {
        roleId,
        permissionId,
      },
    });

    return this.findOne(roleId);
  }

  async removePermission(
    roleId: number,
    permissionId: number,
  ): Promise<RoleWithPermissions> {
    await this.findOne(roleId);

    await this.prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId,
          permissionId,
        },
      },
    });

    return this.findOne(roleId);
  }
}
