import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { Permission } from '../permissions/permissions.interfaces';
import { PrismaService } from '../prisma/prisma.service';
import { Role, RoleWithPermissions } from './roles.interfaces';
import { RolesService } from './roles.service';

const seedRoles: RoleWithPermissions[] = [
  {
    id: 1,
    key: 'USER',
    name: 'User',
    description: 'Default user role.',
    permissions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    key: 'ADMIN',
    name: 'Admin',
    description: 'Administrator role with full management access.',
    permissions: [
      {
        id: 1,
        key: 'users:read',
        name: 'Read users',
        description: 'Allows reading users.',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const seedPermissions: Permission[] = [
  {
    id: 1,
    key: 'users:read',
    name: 'Read users',
    description: 'Allows reading users.',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    key: 'tracks:create',
    name: 'Create tracks',
    description: 'Allows creating tracks.',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe('RolesService', () => {
  let service: RolesService;
  let roles: RoleWithPermissions[];
  let rolePermissions: { roleId: number; permissionId: number }[];
  type RoleWhereUnique = { where: { id?: number; key?: string } };
  type RoleCreateArgs = { data: Omit<Role, 'id' | 'createdAt' | 'updatedAt'> };
  type RoleUpdateArgs = RoleWhereUnique & {
    data: Partial<Omit<Role, 'id' | 'createdAt' | 'updatedAt'>>;
  };
  let prisma: {
    role: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    permission: {
      findUnique: jest.Mock;
    };
    rolePermission: {
      upsert: jest.Mock;
      delete: jest.Mock;
    };
  };

  const withAssignments = (role: RoleWithPermissions | undefined) => {
    if (!role) {
      return null;
    }

    const { permissions, ...roleFields } = role;

    return {
      ...roleFields,
      permissions: permissions.map((permission) => ({ permission })),
    };
  };

  beforeEach(async () => {
    roles = seedRoles.map((role) => ({
      ...role,
      permissions: role.permissions.map((permission) => ({ ...permission })),
    }));
    rolePermissions = [{ roleId: 2, permissionId: 1 }];
    prisma = {
      role: {
        findMany: jest.fn(() =>
          Promise.resolve(
            [...roles]
              .sort((a, b) => a.id - b.id)
              .map((role) => withAssignments(role)),
          ),
        ),
        findUnique: jest.fn(({ where }: RoleWhereUnique) =>
          Promise.resolve(
            withAssignments(
              roles.find(
                (role) => role.id === where.id || role.key === where.key,
              ),
            ),
          ),
        ),
        create: jest.fn(({ data }: RoleCreateArgs) => {
          const role = {
            id: roles.length + 1,
            ...data,
            permissions: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          roles.push(role);
          return Promise.resolve(withAssignments(role));
        }),
        update: jest.fn(({ where, data }: RoleUpdateArgs) => {
          const role = roles.find((item) => item.id === where.id);
          Object.assign(role!, data, { updatedAt: new Date() });
          return Promise.resolve(withAssignments(role));
        }),
        delete: jest.fn(({ where }: RoleWhereUnique) => {
          const index = roles.findIndex((role) => role.id === where.id);
          const [deleted] = roles.splice(index, 1);
          return Promise.resolve(deleted);
        }),
      },
      permission: {
        findUnique: jest.fn(({ where }: { where: { id: number } }) =>
          Promise.resolve(
            seedPermissions.find((permission) => permission.id === where.id) ??
              null,
          ),
        ),
      },
      rolePermission: {
        upsert: jest.fn(
          ({
            create,
          }: {
            create: { roleId: number; permissionId: number };
          }) => {
            if (
              !rolePermissions.some(
                (item) =>
                  item.roleId === create.roleId &&
                  item.permissionId === create.permissionId,
              )
            ) {
              rolePermissions.push(create);
              const role = roles.find((item) => item.id === create.roleId);
              const permission = seedPermissions.find(
                (item) => item.id === create.permissionId,
              );

              if (role && permission) {
                role.permissions.push(permission);
              }
            }

            return Promise.resolve(create);
          },
        ),
        delete: jest.fn(
          ({
            where: {
              roleId_permissionId: { roleId, permissionId },
            },
          }: {
            where: {
              roleId_permissionId: { roleId: number; permissionId: number };
            };
          }) => {
            rolePermissions = rolePermissions.filter(
              (item) =>
                item.roleId !== roleId || item.permissionId !== permissionId,
            );
            const role = roles.find((item) => item.id === roleId);

            if (role) {
              role.permissions = role.permissions.filter(
                (permission) => permission.id !== permissionId,
              );
            }

            return Promise.resolve({ roleId, permissionId });
          },
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  it('returns all roles with permissions', async () => {
    const result = await service.findAll();

    expect(result).toHaveLength(seedRoles.length);
    expect(result[1]?.permissions[0]?.key).toBe('users:read');
  });

  it('finds a role by id', async () => {
    const role = await service.findOne(2);

    expect(role.key).toBe('ADMIN');
    expect(role.permissions).toHaveLength(1);
  });

  it('finds a role by key', async () => {
    const role = await service.findByKey('USER');

    expect(role.id).toBe(1);
  });

  it('throws when role is missing', async () => {
    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    await expect(service.findByKey('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('creates a role', async () => {
    const role = await service.create({
      key: 'ARTIST',
      name: 'Artist',
      description: 'Artist role.',
    });

    expect(role.id).toBe(3);
    expect(role.permissions).toEqual([]);
  });

  it('updates a role', async () => {
    const role = await service.update(1, {
      name: 'Member',
    });

    expect(role.name).toBe('Member');
  });

  it('removes a role', async () => {
    await service.remove(1);

    await expect(service.findAll()).resolves.toHaveLength(seedRoles.length - 1);
  });

  it('assigns a permission to a role', async () => {
    const role = await service.assignPermission(1, 2);

    expect(role.permissions[0]?.key).toBe('tracks:create');
    expect(rolePermissions).toContainEqual({ roleId: 1, permissionId: 2 });
  });

  it('throws when assigning a missing permission', async () => {
    await expect(service.assignPermission(1, 999)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('removes a permission from a role', async () => {
    const role = await service.removePermission(2, 1);

    expect(role.permissions).toEqual([]);
  });
});
