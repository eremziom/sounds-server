import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CreateUserDto } from './create-user.dto';
import { LoginUserDto } from './login-user.dto';
import { UserResponse } from '../users/users.interfaces';

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

describe('AuthController', () => {
  let controller: AuthController;
  let users: UserResponse[];

  beforeEach(async () => {
    users = seedUsers.map((user) => ({ ...user }));
    const authService = {
      findOne: jest.fn((id: number) => {
        const user = users.find((item) => item.id === id);
        if (!user) {
          return Promise.reject(new NotFoundException('User not found'));
        }
        return Promise.resolve(user);
      }),
      register: jest.fn((dto: CreateUserDto) => {
        if (users.some((user) => user.email === dto.email)) {
          return Promise.reject(new ConflictException('Email already in use'));
        }

        const created: UserResponse = {
          id: users.length + 1,
          username: dto.username,
          email: dto.email,
          roles: [
            {
              id: 1,
              key: 'USER',
              name: 'User',
              description: 'Default user role.',
            },
          ],
          bio: dto.bio ?? null,
          avatar: dto.avatar ?? null,
          isActive: true,
          emailVerifiedAt: null,
          lastLoginAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        users.push(created);
        return Promise.resolve(created);
      }),
      login: jest.fn((dto: LoginUserDto) => {
        const user = users.find(
          (item) =>
            (item.email === dto.login || item.username === dto.login) &&
            dto.password === 'Test123!',
        );

        if (!user) {
          return Promise.reject(
            new UnauthorizedException('Invalid credentials'),
          );
        }

        return Promise.resolve(user);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('returns a user by id', async () => {
    await expect(controller.findOne(1)).resolves.toMatchObject({ id: 1 });
  });

  it('registers a user through controller', async () => {
    const dto: CreateUserDto = {
      username: 'ctrl',
      password: 'Secret123!',
      email: 'ctrl@example.com',
    };

    const created: UserResponse = await controller.register(dto);
    expect(created.id).toBeGreaterThan(seedUsers.length);
    expect(created.roles).toEqual([
      {
        id: 1,
        key: 'USER',
        name: 'User',
        description: 'Default user role.',
      },
    ]);
    expect('password' in created).toBe(false);
  });

  it('throws when register email exists', async () => {
    const dto: CreateUserDto = {
      username: 'max',
      password: 'Test123!',
      email: 'max@max.pl',
    };

    await expect(controller.register(dto)).rejects.toThrow(ConflictException);
  });

  it('logs in via controller', async () => {
    const dto: LoginUserDto = { login: 'max', password: 'Test123!' };
    const response: UserResponse = await controller.login(dto);
    expect(response.username).toBe('max');
    expect('password' in response).toBe(false);
  });

  it('throws unauthorized when login fails', async () => {
    const dto: LoginUserDto = { login: 'max', password: 'badpass' };
    await expect(controller.login(dto)).rejects.toThrow(UnauthorizedException);
  });

  it('throws not found for invalid id', async () => {
    await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
  });

  it('does not expose password when returning auth user by id', async () => {
    const result = await controller.findOne(1);

    expect('password' in result).toBe(false);
  });
});
