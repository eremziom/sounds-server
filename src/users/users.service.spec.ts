import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { UsersService } from './users.service';
import { UpdateUserDto } from './update-user.dto';
import { UserResponse, UserRole } from './users.interfaces';
import { PrismaService } from '../prisma/prisma.service';

const seedUsers = [
  {
    id: 1,
    username: 'max',
    password: 'Test123!',
    email: 'max@max.pl',
    roles: [
      {
        role: {
          id: 1,
          key: 'USER',
          name: 'User',
          description: 'Default user role.',
        },
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
    password: 'Test123!',
    email: 'admin@admin.pl',
    roles: [
      {
        role: {
          id: 3,
          key: 'ADMIN',
          name: 'Admin',
          description: 'Administrator role with full management access.',
        },
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

describe('UsersService', () => {
  let service: UsersService;
  let users: typeof seedUsers;
  let userRoles: { userId: number; roleId: number }[];
  type UserWhereUnique = { where: { id: number } };
  type UserUpdateArgs = UserWhereUnique & {
    data: Partial<(typeof seedUsers)[number]>;
  };
  let prisma: {
    $transaction: jest.Mock;
    role: {
      findUnique: jest.Mock;
    };
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    userRole: {
      deleteMany: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    users = seedUsers.map((user) => ({ ...user }));
    userRoles = [
      { userId: 1, roleId: 1 },
      { userId: 2, roleId: 3 },
    ];
    prisma = {
      $transaction: jest.fn((callback: (tx: typeof prisma) => unknown) =>
        Promise.resolve(callback(prisma)),
      ),
      role: {
        findUnique: jest.fn(({ where }: { where: { key: UserRole } }) => {
          const roleByKey = {
            USER: {
              id: 1,
              key: 'USER',
              name: 'User',
              description: 'Default user role.',
            },
            ARTIST: {
              id: 2,
              key: 'ARTIST',
              name: 'Artist',
              description:
                'Artist role for users who can manage their own tracks.',
            },
            ADMIN: {
              id: 3,
              key: 'ADMIN',
              name: 'Admin',
              description: 'Administrator role with full management access.',
            },
          } as const;

          return Promise.resolve(roleByKey[where.key] ?? null);
        }),
      },
      user: {
        findMany: jest.fn(() =>
          Promise.resolve([...users].sort((a, b) => a.id - b.id)),
        ),
        findUnique: jest.fn(({ where: { id } }: UserWhereUnique) =>
          Promise.resolve(users.find((user) => user.id === id) ?? null),
        ),
        update: jest.fn(({ where: { id }, data }: UserUpdateArgs) => {
          const user = users.find((item) => item.id === id);
          Object.assign(user!, data, { updatedAt: new Date() });
          return Promise.resolve(user);
        }),
        delete: jest.fn(({ where: { id } }: UserWhereUnique) => {
          const index = users.findIndex((user) => user.id === id);
          const [deleted] = users.splice(index, 1);
          return Promise.resolve(deleted);
        }),
      },
      userRole: {
        deleteMany: jest.fn(({ where }: { where: { userId: number } }) => {
          userRoles = userRoles.filter((item) => item.userId !== where.userId);
          return Promise.resolve({ count: 1 });
        }),
        create: jest.fn(
          ({ data }: { data: { userId: number; roleId: number } }) => {
            userRoles.push(data);
            const user = users.find((item) => item.id === data.userId);

            if (user) {
              user.roles = [
                {
                  role: {
                    id: data.roleId,
                    key: 'ARTIST',
                    name: 'Artist',
                    description:
                      'Artist role for users who can manage their own tracks.',
                  },
                },
              ];
            }

            return Promise.resolve(data);
          },
        ),
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
    expect(user.roles).toEqual([
      {
        id: 1,
        key: 'USER',
        name: 'User',
        description: 'Default user role.',
      },
    ]);
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

  it('updates user role', async () => {
    const updated: UserResponse = await service.updateRole(1, 'ARTIST');

    expect(updated.roles[0]?.key).toBe('ARTIST');
    expect('password' in updated).toBe(false);
  });

  it('throws when role update target missing', async () => {
    await expect(service.updateRole(999, 'ADMIN')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updates user active status', async () => {
    const updated: UserResponse = await service.updateActive(1, false);

    expect(updated.isActive).toBe(false);
    expect('password' in updated).toBe(false);
  });

  it('throws when active status update target missing', async () => {
    await expect(service.updateActive(999, false)).rejects.toThrow(
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
