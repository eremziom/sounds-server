import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { CreateRoleDto } from './create-role.dto';
import { RoleWithPermissions } from './roles.interfaces';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { UpdateRoleDto } from './update-role.dto';

const seedRoles: RoleWithPermissions[] = [
  {
    id: 1,
    key: 'USER',
    name: 'User',
    description: 'Default user role.',
    permissions: [
      {
        id: 1,
        key: 'tracks:read',
        name: 'Read tracks',
        description: 'Allows reading tracks.',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    key: 'ADMIN',
    name: 'Admin',
    description: 'Administrator role with full management access.',
    permissions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe('RolesController', () => {
  let controller: RolesController;
  let roles: RoleWithPermissions[];

  beforeEach(async () => {
    roles = seedRoles.map((role) => ({
      ...role,
      permissions: role.permissions.map((permission) => ({ ...permission })),
    }));

    const rolesService = {
      findAll: jest.fn(() => Promise.resolve(roles)),
      findOne: jest.fn((id: number) => {
        const role = roles.find((item) => item.id === id);

        if (!role) {
          return Promise.reject(new NotFoundException('Role not found'));
        }

        return Promise.resolve(role);
      }),
      create: jest.fn((dto: CreateRoleDto) => {
        const role: RoleWithPermissions = {
          id: Math.max(...roles.map((item) => item.id)) + 1,
          ...dto,
          description: dto.description ?? null,
          permissions: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        roles.push(role);
        return Promise.resolve(role);
      }),
      update: jest.fn((id: number, dto: UpdateRoleDto) => {
        const role = roles.find((item) => item.id === id);

        if (!role) {
          return Promise.reject(new NotFoundException('Role not found'));
        }

        Object.assign(role, dto);
        return Promise.resolve(role);
      }),
      remove: jest.fn((id: number) => {
        const index = roles.findIndex((item) => item.id === id);

        if (index === -1) {
          return Promise.reject(new NotFoundException('Role not found'));
        }

        roles.splice(index, 1);
        return Promise.resolve();
      }),
      assignPermission: jest.fn((roleId: number, permissionId: number) => {
        const role = roles.find((item) => item.id === roleId);

        if (!role) {
          return Promise.reject(new NotFoundException('Role not found'));
        }

        role.permissions.push({
          id: permissionId,
          key: 'tracks:create',
          name: 'Create tracks',
          description: 'Allows creating tracks.',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        return Promise.resolve(role);
      }),
      removePermission: jest.fn((roleId: number, permissionId: number) => {
        const role = roles.find((item) => item.id === roleId);

        if (!role) {
          return Promise.reject(new NotFoundException('Role not found'));
        }

        role.permissions = role.permissions.filter(
          (permission) => permission.id !== permissionId,
        );

        return Promise.resolve(role);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [
        {
          provide: RolesService,
          useValue: rolesService,
        },
      ],
    }).compile();

    controller = module.get<RolesController>(RolesController);
  });

  it('returns all roles', async () => {
    await expect(controller.findAll()).resolves.toHaveLength(seedRoles.length);
  });

  it('returns a role by id', async () => {
    const role = await controller.findOne(1);

    expect(role.key).toBe('USER');
  });

  it('creates a role', async () => {
    const role = await controller.create({
      key: 'MODERATOR',
      name: 'Moderator',
      description: 'Can moderate content.',
    });

    expect(role.id).toBe(3);
    expect(role.permissions).toEqual([]);
  });

  it('creates a role with null description when omitted', async () => {
    const role = await controller.create({
      key: 'EDITOR',
      name: 'Editor',
    });

    expect(role.description).toBeNull();
  });

  it('updates a role', async () => {
    const role = await controller.update(1, {
      name: 'Member',
    });

    expect(role.name).toBe('Member');
  });

  it('removes a role', async () => {
    await controller.remove(1);

    await expect(controller.findAll()).resolves.toHaveLength(
      seedRoles.length - 1,
    );
  });

  it('assigns a permission to a role', async () => {
    const role = await controller.assignPermission(2, 2);

    expect(role.permissions[0]?.id).toBe(2);
  });

  it('removes a permission from a role', async () => {
    const role = await controller.removePermission(1, 1);

    expect(role.permissions).toEqual([]);
  });

  it('throws when role is missing', async () => {
    await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
  });
});
