import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { AuthService } from './auth.service';
import { CreateUserDto } from './create-user.dto';
import { LoginUserDto } from './login-user.dto';
import { UserResponse } from '../users/users.interfaces';
import { PrismaService } from '../prisma/prisma.service';

const seedUsers = [
  {
    id: 1,
    username: 'max',
    password: '',
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
    password: '',
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

describe('AuthService', () => {
  let service: AuthService;
  let users: typeof seedUsers;
  let userRoles: { userId: number; roleId: number }[];
  type UserWhereUnique = { where: { id: number } | { email: string } };
  type UserFindFirstArgs = {
    where: { OR: { email?: string; username?: string }[] };
  };
  type UserCreateArgs = {
    data: CreateUserDto;
  };
  type UserUpdateArgs = {
    where: { id: number };
    data: Partial<(typeof seedUsers)[number]>;
  };
  let prisma: {
    $transaction: jest.Mock;
    role: {
      findUnique: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    userRole: {
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    users = await Promise.all(
      seedUsers.map(async (user) => ({
        ...user,
        password: await argon2.hash('Test123!'),
      })),
    );
    userRoles = [];
    prisma = {
      $transaction: jest.fn((callback: (tx: typeof prisma) => unknown) =>
        Promise.resolve(callback(prisma)),
      ),
      role: {
        findUnique: jest.fn(({ where }: { where: { key: string } }) =>
          Promise.resolve(
            where.key === 'USER'
              ? {
                  id: 1,
                  key: 'USER',
                  name: 'User',
                  description: 'Default user role.',
                }
              : null,
          ),
        ),
      },
      user: {
        findUnique: jest.fn(({ where }: UserWhereUnique) => {
          if ('id' in where) {
            return Promise.resolve(
              users.find((user) => user.id === where.id) ?? null,
            );
          }

          if ('email' in where) {
            return Promise.resolve(
              users.find((user) => user.email === where.email) ?? null,
            );
          }

          return Promise.resolve(null);
        }),
        findFirst: jest.fn(({ where: { OR } }: UserFindFirstArgs) =>
          Promise.resolve(
            users.find((user) =>
              OR.some(
                (condition: { email?: string; username?: string }) =>
                  user.email === condition.email ||
                  user.username === condition.username,
              ),
            ) ?? null,
          ),
        ),
        create: jest.fn(({ data }: UserCreateArgs) => {
          const created = {
            id: users.length + 1,
            roles: [],
            bio: null,
            avatar: null,
            isActive: true,
            emailVerifiedAt: null,
            lastLoginAt: null,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          users.push(created);
          return Promise.resolve(created);
        }),
        update: jest.fn(({ where: { id }, data }: UserUpdateArgs) => {
          const user = users.find((item) => item.id === id);
          Object.assign(user!, data, { updatedAt: new Date() });
          return Promise.resolve(user);
        }),
      },
      userRole: {
        create: jest.fn(
          ({ data }: { data: { userId: number; roleId: number } }) => {
            userRoles.push(data);
            return Promise.resolve(data);
          },
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('finds the user by id', async () => {
    const result = await service.findOne(1);
    expect(result.id).toBe(1);
  });

  it('throws when user is missing', async () => {
    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });

  it('registers a new user and hides the password', async () => {
    const dto: CreateUserDto = {
      username: 'newcomer',
      password: 'Secret123!',
      email: 'new@example.com',
      bio: 'bio',
      avatar: 'https://example.com/avatar.png',
    };

    const created: UserResponse = await service.register(dto);
    const storedUser = users.find((user) => user.id === created.id);

    expect(created.id).toBeGreaterThan(seedUsers.length);
    expect('password' in created).toBe(false);
    expect(storedUser?.password).toMatch(/^\$argon2/);
    expect(storedUser?.password).not.toBe(dto.password);
    expect(users).toHaveLength(seedUsers.length + 1);
    expect(userRoles).toContainEqual({ userId: created.id, roleId: 1 });
    expect(created.roles).toEqual([
      {
        id: 1,
        key: 'USER',
        name: 'User',
        description: 'Default user role.',
      },
    ]);
  });

  it('throws when default user role is missing', async () => {
    prisma.role.findUnique.mockResolvedValueOnce(null);

    const dto: CreateUserDto = {
      username: 'newcomer',
      password: 'Secret123!',
      email: 'new@example.com',
    };

    await expect(service.register(dto)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('rejects duplicate emails', async () => {
    const dto: CreateUserDto = {
      username: 'max',
      password: 'Test123!',
      email: 'max@max.pl',
    };

    await expect(service.register(dto)).rejects.toThrow(ConflictException);
  });

  it('logs in with username', async () => {
    const dto: LoginUserDto = { login: 'admin', password: 'Test123!' };
    const response: UserResponse = await service.login(dto);
    expect(response.username).toBe('admin');
    expect(response.roles).toEqual([
      {
        id: 3,
        key: 'ADMIN',
        name: 'Admin',
        description: 'Administrator role with full management access.',
      },
    ]);
    expect(response.lastLoginAt).toBeInstanceOf(Date);
    expect('password' in response).toBe(false);
  });

  it('fails login with wrong password', async () => {
    const dto: LoginUserDto = { login: 'admin', password: 'wrong' };
    await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
  });
});
