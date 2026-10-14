import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CreatePermissionData,
  Permission,
  UpdatePermissionData,
} from './permissions.interfaces';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Permission[]> {
    return this.prisma.permission.findMany({
      orderBy: {
        id: 'asc',
      },
    });
  }

  async findOne(id: number): Promise<Permission> {
    const permission = await this.prisma.permission.findUnique({
      where: { id },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return permission;
  }

  async findByKey(key: string): Promise<Permission> {
    const permission = await this.prisma.permission.findUnique({
      where: { key },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return permission;
  }

  async create(data: CreatePermissionData): Promise<Permission> {
    return this.prisma.permission.create({
      data,
    });
  }

  async update(id: number, data: UpdatePermissionData): Promise<Permission> {
    await this.findOne(id);

    return this.prisma.permission.update({
      where: { id },
      data,
    });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);

    await this.prisma.permission.delete({
      where: { id },
    });
  }
}
