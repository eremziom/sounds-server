import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { UsersController } from './users.controller';
import { UpdateUserDto } from './update-user.dto';
import { UserResponse, UserRole } from './users.interfaces';
import { UsersService } from './users.service';

const seedUsers: UserResponse[] = [
  {
    id: 1,
    username: 'max',
    email: 'max@max.pl',
    roles: [
      {
        id: 1,
        key: 'USER',
        name: 'User',
        description: 'Default user role.',
      },
    ],
    bio: 'bio',
    avatar: 'avatar',
    isActive: true,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    username: 'admin',
    email: 'admin@admin.pl',
    roles: [
      {
        id: 3,
        key: 'ADMIN',
        name: 'Admin',
        description: 'Administrator role with full management access.',
      },
    ],
    bio: 'bio',
    avatar: 'avatar',
    isActive: true,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe('UsersController', () => {
  let controller: UsersController;
  let users: UserResponse[];

  beforeEach(async () => {
    users = seedUsers.map((user) => ({ ...user }));
    const usersService = {
      findAll: jest.fn(() => Promise.resolve(users)),
      findOne: jest.fn((id: number) => {
        const user = users.find((item) => item.id === id);
        if (!user) {
          return Promise.reject(new NotFoundException('User not found'));
        }
        return Promise.resolve(user);
      }),
      update: jest.fn((id: number, dto: UpdateUserDto) => {
        const user = users.find((item) => item.id === id);
        if (!user) {
          return Promise.reject(new NotFoundException('User not found'));
        }
        Object.assign(user, dto);
        return Promise.resolve(user);
      }),
      updateRole: jest.fn((id: number, role: UserRole) => {
        const user = users.find((item) => item.id === id);
        if (!user) {
          return Promise.reject(new NotFoundException('User not found'));
        }
        user.roles = [
          {
            id: role === 'ARTIST' ? 2 : 3,
            key: role,
            name: role === 'ARTIST' ? 'Artist' : 'Admin',
            description: null,
          },
        ];
        return Promise.resolve(user);
      }),
      updateActive: jest.fn((id: number, isActive: boolean) => {
        const user = users.find((item) => item.id === id);
        if (!user) {
          return Promise.reject(new NotFoundException('User not found'));
        }
        user.isActive = isActive;
        return Promise.resolve(user);
      }),
      remove: jest.fn((id: number) => {
        const index = users.findIndex((item) => item.id === id);
        if (index === -1) {
          return Promise.reject(new NotFoundException('User not found'));
        }
        users.splice(index, 1);
        return Promise.resolve();
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('returns list of users', async () => {
    await expect(controller.findAll()).resolves.toHaveLength(seedUsers.length);
  });

  it('returns a user by id', async () => {
    const user = await controller.findOne(1);
    expect(user.id).toBe(1);
    expect(user.roles).toEqual([
      {
        id: 1,
        key: 'USER',
        name: 'User',
        description: 'Default user role.',
      },
    ]);
  });

  it('updates a user with only provided fields', async () => {
    const dto: UpdateUserDto = { username: 'updated-name' };
    const updated: UserResponse = await controller.update(1, dto);
    expect(updated.username).toBe('updated-name');
    expect('password' in updated).toBe(false);
  });

  it('updates user role', async () => {
    const updated: UserResponse = await controller.updateRole(1, {
      role: 'ARTIST',
    });

    expect(updated.roles[0]?.key).toBe('ARTIST');
    expect('password' in updated).toBe(false);
  });

  it('throws when role update target missing', async () => {
    await expect(controller.updateRole(999, { role: 'ADMIN' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updates user active status', async () => {
    const updated: UserResponse = await controller.updateActive(1, {
      isActive: false,
    });

    expect(updated.isActive).toBe(false);
    expect('password' in updated).toBe(false);
  });

  it('throws when active status update target missing', async () => {
    await expect(
      controller.updateActive(999, { isActive: false }),
    ).rejects.toThrow(NotFoundException);
  });

  it('removes a user by id', async () => {
    await controller.remove(2);
    await expect(controller.findAll()).resolves.toHaveLength(
      seedUsers.length - 1,
    );
  });

  it('throws when user missing', async () => {
    await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
  });

  it('does not expose passwords in users list', async () => {
    const result = await controller.findAll();

    expect(result.every((user) => !('password' in user))).toBe(true);
  });

  it('does not expose password when returning user by id', async () => {
    const result = await controller.findOne(1);

    expect('password' in result).toBe(false);
  });
});
