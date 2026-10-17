import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsGuard } from '../permissions/permissions.guard';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { Permission } from './permissions.interfaces';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

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
    key: 'users:read',
    name: 'Read users',
    description: 'Allows reading users.',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe('PermissionsController', () => {
  let controller: PermissionsController;
  let permissions: Permission[];

  beforeEach(async () => {
    permissions = seedPermissions.map((permission) => ({ ...permission }));

    const permissionsService = {
      findAll: jest.fn(() => Promise.resolve(permissions)),
      findOne: jest.fn((id: number) => {
        const permission = permissions.find((item) => item.id === id);

        if (!permission) {
          return Promise.reject(new NotFoundException('Permission not found'));
        }

        return Promise.resolve(permission);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [
        {
          provide: PermissionsService,
          useValue: permissionsService,
        },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PermissionsController>(PermissionsController);
  });

  it('returns all permissions', async () => {
    await expect(controller.findAll()).resolves.toHaveLength(
      seedPermissions.length,
    );
  });

  it('returns a permission by id', async () => {
    const permission = await controller.findOne(1);

    expect(permission.key).toBe('tracks:read');
  });

  it('throws when permission is missing', async () => {
    await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
  });
});
