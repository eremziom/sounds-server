import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { PermissionsService } from './permissions.service';
import { Permission } from './permissions.interfaces';
import { PrismaService } from '../prisma/prisma.service';

const seedPermissions: Permission[] = [
  {
    id: 1,
    key: 'tracks:read',
    name: 'Read tracks',
    description: 'Allows reading tracks.',
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

describe('PermissionsService', () => {
  let service: PermissionsService;
  let permissions: Permission[];
  type PermissionWhereUnique = { where: { id?: number; key?: string } };
  type PermissionCreateArgs = {
    data: Omit<Permission, 'id' | 'createdAt' | 'updatedAt'>;
  };
  type PermissionUpdateArgs = PermissionWhereUnique & {
    data: Partial<Omit<Permission, 'id' | 'createdAt' | 'updatedAt'>>;
  };
  let prisma: {
    permission: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    permissions = seedPermissions.map((permission) => ({ ...permission }));
    prisma = {
      permission: {
        findMany: jest.fn(() =>
          Promise.resolve([...permissions].sort((a, b) => a.id - b.id)),
        ),
        findUnique: jest.fn(({ where }: PermissionWhereUnique) =>
          Promise.resolve(
            permissions.find(
              (permission) =>
                permission.id === where.id || permission.key === where.key,
            ) ?? null,
          ),
        ),
        create: jest.fn(({ data }: PermissionCreateArgs) => {
          const permission = {
            id: permissions.length + 1,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          permissions.push(permission);
          return Promise.resolve(permission);
        }),
        update: jest.fn(({ where, data }: PermissionUpdateArgs) => {
          const permission = permissions.find((item) => item.id === where.id);
          Object.assign(permission!, data, { updatedAt: new Date() });
          return Promise.resolve(permission);
        }),
        delete: jest.fn(({ where }: PermissionWhereUnique) => {
          const index = permissions.findIndex((item) => item.id === where.id);
          const [deleted] = permissions.splice(index, 1);
          return Promise.resolve(deleted);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
  });

  it('returns all permissions', async () => {
    await expect(service.findAll()).resolves.toHaveLength(
      seedPermissions.length,
    );
  });

  it('finds a permission by id', async () => {
    const permission = await service.findOne(1);

    expect(permission.key).toBe('tracks:read');
  });

  it('finds a permission by key', async () => {
    const permission = await service.findByKey('tracks:create');

    expect(permission.id).toBe(2);
  });

  it('throws when permission is missing', async () => {
    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    await expect(service.findByKey('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('creates a permission', async () => {
    const permission = await service.create({
      key: 'tracks:update',
      name: 'Update tracks',
      description: 'Allows updating tracks.',
    });

    expect(permission.id).toBe(3);
    expect(permissions).toHaveLength(seedPermissions.length + 1);
  });

  it('updates a permission', async () => {
    const permission = await service.update(1, {
      name: 'Read all tracks',
    });

    expect(permission.name).toBe('Read all tracks');
  });

  it('removes a permission', async () => {
    await service.remove(2);

    await expect(service.findAll()).resolves.toHaveLength(
      seedPermissions.length - 1,
    );
  });
});
