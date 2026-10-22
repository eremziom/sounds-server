import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { PrismaService } from '../prisma/prisma.service';
import { PermissionsGuard } from './permissions.guard';

type RequestUser = {
  user?: {
    userId: number;
    username: string;
    roles: string[];
  };
};

const createExecutionContext = (request: RequestUser): ExecutionContext =>
  ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn(() => ({
      getRequest: jest.fn(() => request),
    })),
  }) as unknown as ExecutionContext;

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: {
    getAllAndOverride: jest.Mock;
  };
  let prisma: {
    user: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn(() => ['tracks:create']),
    };
    prisma = {
      user: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            isActive: true,
            roles: [
              {
                role: {
                  permissions: [
                    {
                      permission: {
                        key: 'tracks:create',
                      },
                    },
                  ],
                },
              },
            ],
          }),
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        {
          provide: Reflector,
          useValue: reflector,
        },
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    guard = module.get<PermissionsGuard>(PermissionsGuard);
  });

  it('allows requests when no permissions are required', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(undefined);

    await expect(guard.canActivate(createExecutionContext({}))).resolves.toBe(
      true,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws unauthorized when request has no authenticated user', async () => {
    await expect(guard.canActivate(createExecutionContext({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('allows requests when user has required permissions', async () => {
    await expect(
      guard.canActivate(
        createExecutionContext({
          user: {
            userId: 1,
            username: 'artist',
            roles: ['ARTIST'],
          },
        }),
      ),
    ).resolves.toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      select: {
        isActive: true,
        roles: {
          select: {
            role: {
              select: {
                permissions: {
                  select: {
                    permission: {
                      select: {
                        key: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it('throws forbidden when user is inactive', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      isActive: false,
      roles: [],
    });

    await expect(
      guard.canActivate(
        createExecutionContext({
          user: {
            userId: 1,
            username: 'inactive',
            roles: ['USER'],
          },
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws forbidden when user misses required permission', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      isActive: true,
      roles: [
        {
          role: {
            permissions: [
              {
                permission: {
                  key: 'tracks:read',
                },
              },
            ],
          },
        },
      ],
    });

    await expect(
      guard.canActivate(
        createExecutionContext({
          user: {
            userId: 1,
            username: 'user',
            roles: ['USER'],
          },
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
