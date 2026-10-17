import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';
import { TracksService } from '../tracks/tracks.service';
import { UsersService } from '../users/users.service';
import { PermissionsService } from './permissions.service';

type Endpoint = [
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  permission: string,
  service: string,
  operation: string,
];

const endpoints: Endpoint[] = [
  ['get', '/users', 'users:read', 'users', 'findAll'],
  ['get', '/users/1', 'users:read', 'users', 'findOne'],
  ['patch', '/users/1', 'users:update', 'users', 'update'],
  ['delete', '/users/1', 'users:delete', 'users', 'remove'],
  ['patch', '/users/1/role', 'users:set-role', 'users', 'updateRole'],
  ['patch', '/users/1/active', 'users:set-active', 'users', 'updateActive'],
  ['get', '/roles', 'roles:read', 'roles', 'findAll'],
  ['get', '/roles/1', 'roles:read', 'roles', 'findOne'],
  ['post', '/roles', 'roles:create', 'roles', 'create'],
  ['patch', '/roles/1', 'roles:update', 'roles', 'update'],
  ['delete', '/roles/1', 'roles:delete', 'roles', 'remove'],
  [
    'post',
    '/roles/1/permissions/2',
    'permissions:assign',
    'roles',
    'assignPermission',
  ],
  [
    'delete',
    '/roles/1/permissions/2',
    'permissions:assign',
    'roles',
    'removePermission',
  ],
  ['get', '/permissions', 'permissions:read', 'permissions', 'findAll'],
  ['get', '/permissions/1', 'permissions:read', 'permissions', 'findOne'],
  ['get', '/tracks', 'tracks:read', 'tracks', 'findAll'],
  ['get', '/tracks/1', 'tracks:read', 'tracks', 'findOne'],
  ['post', '/tracks', 'tracks:create', 'tracks', 'create'],
  ['patch', '/tracks/1', 'tracks:update-any', 'tracks', 'update'],
  ['delete', '/tracks/1', 'tracks:delete-any', 'tracks', 'remove'],
  ['get', '/auth/user/1', 'users:read', 'auth', 'findOne'],
  ['get', '/auth/me', 'users:read-own', 'auth', 'findOne'],
];

describe('Endpoint permissions (HTTP)', () => {
  let app: INestApplication<App>;
  const secret = 'endpoint-permissions-test-secret';
  const jwt = new JwtService({ secret });
  // Role names in a token must not bypass permissions stored in the database.
  const payload = { sub: 42, username: 'tester', roles: ['ADMIN'] };
  const token = jwt.sign(payload, { expiresIn: '5m' });
  const services: Record<string, Record<string, jest.Mock>> = {};
  const prisma = { user: { findUnique: jest.fn() } };

  const grant = (permissions: string[], isActive = true) => {
    prisma.user.findUnique.mockResolvedValue({
      isActive,
      roles: [
        {
          role: {
            permissions: permissions.map((key) => ({ permission: { key } })),
          },
        },
      ],
    });
  };

  beforeAll(async () => {
    const builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue({
        getOrThrow: () => secret,
        get: (_key: string, defaultValue: string) => defaultValue,
      })
      .overrideProvider(PrismaService)
      .useValue(prisma);

    const providers = {
      users: UsersService,
      roles: RolesService,
      permissions: PermissionsService,
      tracks: TracksService,
      auth: AuthService,
    };
    for (const [name, provider] of Object.entries(providers)) {
      services[name] = Object.fromEntries(
        [
          'findAll',
          'findOne',
          'create',
          'update',
          'remove',
          'updateRole',
          'updateActive',
          'assignPermission',
          'removePermission',
          'login',
          'register',
        ].map((operation) => [
          operation,
          jest.fn().mockResolvedValue({ id: 1 }),
        ]),
      );
      builder.overrideProvider(provider).useValue(services[name]);
    }

    const module = await builder.compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    grant([]);
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(endpoints)(
    '%s %s requires %s',
    async (method, path, permission, service, operation) => {
      const send = (accessToken?: string) => {
        const pending = request(app.getHttpServer())[method](path).send({});
        return accessToken
          ? pending.auth(accessToken, { type: 'bearer' })
          : pending;
      };

      await send().expect(401);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(services[service][operation]).not.toHaveBeenCalled();

      await send(token).expect(403);
      expect(services[service][operation]).not.toHaveBeenCalled();

      // An unrelated permission must not grant access either.
      grant(['unrelated:permission']);
      await send(token).expect(403);
      expect(services[service][operation]).not.toHaveBeenCalled();

      grant([permission]);
      await send(token).expect(method === 'post' ? 201 : 200);
      expect(services[service][operation]).toHaveBeenCalledTimes(1);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 42 } }),
      );
    },
  );

  it('rejects invalid, expired and incorrectly signed tokens before authorization', async () => {
    grant(['users:read']);
    const invalidTokens = [
      'invalid-token',
      jwt.sign(payload, { expiresIn: -1 }),
      new JwtService({ secret: 'wrong-secret' }).sign(payload),
    ];
    for (const invalidToken of invalidTokens) {
      await request(app.getHttpServer())
        .get('/users')
        .auth(invalidToken, { type: 'bearer' })
        .expect(401);
    }
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(services.users.findAll).not.toHaveBeenCalled();
  });

  it('rejects inactive and deleted users despite a valid token', async () => {
    grant(['users:read'], false);
    await request(app.getHttpServer())
      .get('/users')
      .auth(token, { type: 'bearer' })
      .expect(403);
    prisma.user.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/users')
      .auth(token, { type: 'bearer' })
      .expect(403);
    expect(services.users.findAll).not.toHaveBeenCalled();
  });

  it('applies permission revocation on the next request with the same token', async () => {
    grant(['users:read']);
    await request(app.getHttpServer())
      .get('/users')
      .auth(token, { type: 'bearer' })
      .expect(200);
    grant([]);
    await request(app.getHttpServer())
      .get('/users')
      .auth(token, { type: 'bearer' })
      .expect(403);
    expect(services.users.findAll).toHaveBeenCalledTimes(1);
  });

  it('uses the authenticated user ID for the current profile', async () => {
    grant(['users:read-own']);
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(services.auth.findOne).toHaveBeenCalledWith(42);
    await request(app.getHttpServer())
      .get('/auth/user/1')
      .auth(token, { type: 'bearer' })
      .expect(403);
  });

  it('combines permissions from multiple database roles', async () => {
    prisma.user.findUnique.mockResolvedValue({
      isActive: true,
      roles: ['tracks:read', 'users:read'].map((key) => ({
        role: { permissions: [{ permission: { key } }] },
      })),
    });
    for (const path of ['/tracks', '/users']) {
      await request(app.getHttpServer())
        .get(path)
        .auth(token, { type: 'bearer' })
        .expect(200);
    }
  });

  it.each([
    ['patch', 'tracks:update-own', 'update'],
    ['delete', 'tracks:delete-own', 'remove'],
  ] as const)(
    'does not allow %s with only %s',
    async (method, permission, operation) => {
      grant([permission]);
      await request(app.getHttpServer())
        [method]('/tracks/1')
        .auth(token, { type: 'bearer' })
        .send({})
        .expect(403);
      expect(services.tracks[operation]).not.toHaveBeenCalled();
    },
  );

  it('keeps login, registration and the root endpoint public', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
    for (const operation of ['login', 'register']) {
      await request(app.getHttpServer())
        .post(`/auth/${operation}`)
        .send({})
        .expect(201);
      expect(services.auth[operation]).toHaveBeenCalledTimes(1);
    }
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
