import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { UsersService } from './users.service';
import { UpdateUserDto } from './update-user.dto';
import { UserResponse } from './users.interfaces';
import { PrismaService } from '../prisma/prisma.service';

const seedUsers = [
  {
    id: 1,
    username: 'max',
    password: 'Test123!',
    email: 'max@max.pl',
    role: 'USER' as const,
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
    password: 'Test123!',
    email: 'admin@admin.pl',
    role: 'ADMIN' as const,
    bio: 'bio',
    avatar: 'avatar',
    isActive: true,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe('UsersService', () => {
  let service: UsersService;
  let users: typeof seedUsers;
  let prisma: {
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    users = seedUsers.map((user) => ({ ...user }));
    prisma = {
      user: {
        findMany: jest.fn(async () => [...users].sort((a, b) => a.id - b.id)),
        findUnique: jest.fn(async ({ where: { id } }) => {
          return users.find((user) => user.id === id) ?? null;
        }),
        update: jest.fn(async ({ where: { id }, data }) => {
          const user = users.find((item) => item.id === id);
          Object.assign(user!, data, { updatedAt: new Date() });
          return user;
        }),
        delete: jest.fn(async ({ where: { id } }) => {
          const index = users.findIndex((user) => user.id === id);
          const [deleted] = users.splice(index, 1);
          return deleted;
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('returns all users', async () => {
    await expect(service.findAll()).resolves.toHaveLength(seedUsers.length);
  });

  it('finds a user by id', async () => {
    const user = await service.findOne(1);
    expect(user.id).toBe(1);
  });

  it('throws when user is missing', async () => {
    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });

  it('updates only provided fields', async () => {
    const payload: Partial<UpdateUserDto> = { bio: 'Updated bio' };
    const updated: UserResponse = await service.update(1, payload);
    expect(updated.bio).toBe('Updated bio');
    expect(updated.username).toBe(seedUsers[0].username);
    expect('password' in updated).toBe(false);
  });

  it('throws when update target missing', async () => {
    await expect(service.update(999, { username: 'missing' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('removes a user by id', async () => {
    await service.remove(2);
    await expect(service.findAll()).resolves.toHaveLength(seedUsers.length - 1);
  });

  it('throws when removing non-existing user', async () => {
    await expect(service.remove(999)).rejects.toThrow(NotFoundException);
  });
});
