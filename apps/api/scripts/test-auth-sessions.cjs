/* Runs against a freshly created temporary database, never against app data. */
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
require('dotenv').config({ quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const databaseName = `sounds_auth_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  const testUrl = new URL(process.env.DATABASE_URL);
  testUrl.pathname = `/${databaseName}`;
  let created = false;
  let app;
  let prisma;
  let db;
  let checks = 0;
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    process.env.DATABASE_URL = testUrl.toString();
    process.env.JWT_SECRET = randomUUID();
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.REFRESH_SESSION_DAYS = '30';
    execFileSync(
      process.execPath,
      [path.resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
      {
        env: process.env,
        stdio: 'pipe',
      },
    );
    db = new Pool({ connectionString: testUrl.toString() });
    await db.query(readFileSync(path.resolve('prisma/seed-rbac.sql'), 'utf8'));

    const { NestFactory } = require('@nestjs/core');
    const { ValidationPipe } = require('@nestjs/common');
    const { AppModule } = require('../dist/src/app.module.js');
    const { PrismaService } = require('../dist/src/prisma/prisma.service.js');
    const { UsersService } = require('../dist/src/users/users.service.js');
    const { JwtService } = require('@nestjs/jwt');
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    const users = app.get(UsersService);
    const baseUrl = await app.getUrl();
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });

    async function call(method, route, body, token, expected) {
      const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = response.status === 204 ? null : await response.json();
      if (expected !== undefined)
        assert.equal(
          response.status,
          expected,
          `${method} ${route}: ${JSON.stringify(data)}`,
        );
      checks++;
      return expected === undefined ? { status: response.status, data } : data;
    }
    const refresh = (token, expected = 200) =>
      call('POST', '/auth/refresh', { refreshToken: token }, null, expected);
    const me = (token, expected = 200) =>
      call('GET', '/auth/me', null, token, expected);
    const logout = (token) =>
      call('POST', '/auth/logout', { refreshToken: token }, null, 204);
    const login = () =>
      call(
        'POST',
        '/auth/login',
        { login: 'session-tester', password: 'Test123!' },
        null,
        201,
      );

    const registered = await call(
      'POST',
      '/auth/register',
      {
        username: 'session-tester',
        email: 'sessions@example.com',
        password: 'Test123!',
      },
      null,
      201,
    );
    assert.equal('password' in registered.user, false);
    assert.match(registered.refreshToken, /^[a-f0-9]{64}$/);
    const initialPayload = jwt.verify(registered.accessToken);
    assert.equal(initialPayload.exp - initialPayload.iat, 900);
    await me(registered.accessToken);
    const stored = await prisma.refreshToken.findUnique({
      where: {
        tokenHash: createHash('sha256')
          .update(registered.refreshToken)
          .digest('hex'),
      },
    });
    assert.ok(stored);
    assert.notEqual(stored.tokenHash, registered.refreshToken);
    assert.equal(
      new Date(registered.refreshTokenExpiresAt).getTime() -
        new Date(registered.user.createdAt).getTime() <
        30 * 86400000 + 5000,
      true,
    );

    await call('POST', '/auth/refresh', {}, null, 400);
    await refresh('invalid', 400);
    await refresh('a'.repeat(64), 401);
    await call('POST', '/auth/logout', {}, null, 400);
    await call('POST', '/auth/logout-all', null, null, 401);
    await me(
      jwt.sign({
        sub: registered.user.id,
        username: 'session-tester',
        roles: ['USER'],
      }),
      401,
    );
    await me(jwt.sign({ ...initialPayload, sid: randomUUID() }), 401);
    await me(jwt.sign({ ...initialPayload, sub: registered.user.id + 1 }), 401);
    await me(jwt.sign({ ...initialPayload, exp: 1 }), 401);

    const rotated = await refresh(registered.refreshToken);
    assert.notEqual(rotated.refreshToken, registered.refreshToken);
    assert.notEqual(rotated.accessToken, registered.accessToken);
    assert.equal(
      rotated.refreshTokenExpiresAt,
      registered.refreshTokenExpiresAt,
    );
    await me(rotated.accessToken);
    await refresh(registered.refreshToken, 401);
    await me(rotated.accessToken, 401);
    await me(registered.accessToken, 401);
    await refresh(rotated.refreshToken, 401);
    assert.ok(
      (
        await prisma.authSession.findUnique({
          where: { id: initialPayload.sid },
        })
      ).revokedAt,
    );

    const first = await login();
    const second = await login();
    await logout(first.refreshToken);
    await logout(first.refreshToken);
    await me(first.accessToken, 401);
    await refresh(first.refreshToken, 401);
    await me(second.accessToken);
    const third = await login();
    await call('POST', '/auth/logout-all', null, second.accessToken, 204);
    await me(second.accessToken, 401);
    await refresh(second.refreshToken, 401);
    await me(third.accessToken, 401);
    await refresh(third.refreshToken, 401);

    const concurrent = await login();
    const attempts = await Promise.all([
      call('POST', '/auth/refresh', { refreshToken: concurrent.refreshToken }),
      call('POST', '/auth/refresh', { refreshToken: concurrent.refreshToken }),
    ]);
    assert.deepEqual(attempts.map((entry) => entry.status).sort(), [200, 401]);
    const concurrencySession = await prisma.authSession.findUnique({
      where: { id: jwt.verify(concurrent.accessToken).sid },
    });
    assert.ok(concurrencySession.revokedAt);
    const issued = await prisma.refreshToken.findMany({
      where: { sessionId: concurrencySession.id },
    });
    assert.equal(issued.length, 2);
    assert.equal(issued.filter((entry) => entry.usedAt).length, 1);
    const winner = attempts.find((entry) => entry.status === 200).data;
    await me(winner.accessToken, 401);
    await refresh(winner.refreshToken, 401);
    await me(concurrent.accessToken, 401);

    const expired = await login();
    await prisma.authSession.update({
      where: { id: jwt.verify(expired.accessToken).sid },
      data: { expiresAt: new Date(0) },
    });
    await me(expired.accessToken, 401);
    await refresh(expired.refreshToken, 401);
    const expiredRefresh = await login();
    await prisma.refreshToken.update({
      where: {
        tokenHash: createHash('sha256')
          .update(expiredRefresh.refreshToken)
          .digest('hex'),
      },
      data: { expiresAt: new Date(0) },
    });
    await refresh(expiredRefresh.refreshToken, 401);

    // Signing failure must roll back consumption and token creation together.
    const rollback = await login();
    const signing = app.get(JwtService);
    const originalSign = signing.signAsync;
    signing.signAsync = async () => {
      throw new Error('Simulated signer failure');
    };
    try {
      await refresh(rollback.refreshToken, 500);
    } finally {
      signing.signAsync = originalSign;
    }
    const recovered = await refresh(rollback.refreshToken);
    await me(recovered.accessToken);

    // Logout and refresh use the same lock; logout must leave no live session.
    const logoutRace = await login();
    const [raceRefresh] = await Promise.all([
      call('POST', '/auth/refresh', { refreshToken: logoutRace.refreshToken }),
      logout(logoutRace.refreshToken),
    ]);
    assert.ok([200, 401].includes(raceRefresh.status));
    await me(logoutRace.accessToken, 401);
    if (raceRefresh.status === 200) {
      await me(raceRefresh.data.accessToken, 401);
      await refresh(raceRefresh.data.refreshToken, 401);
    }

    const beforeDeactivation = await login();
    await users.updateActive(registered.user.id, false);
    await me(beforeDeactivation.accessToken, 401);
    await refresh(beforeDeactivation.refreshToken, 401);
    await call(
      'POST',
      '/auth/login',
      { login: 'session-tester', password: 'Test123!' },
      null,
      401,
    );
    await users.updateActive(registered.user.id, true);
    await me(beforeDeactivation.accessToken, 401);
    await refresh(beforeDeactivation.refreshToken, 401);

    // Refreshed responses read current role assignments, not the old JWT roles.
    const beforeRoles = await login();
    const artist = await prisma.role.findUnique({ where: { key: 'ARTIST' } });
    await prisma.userRole.create({
      data: { userId: registered.user.id, roleId: artist.id },
    });
    const afterRoles = await refresh(beforeRoles.refreshToken);
    assert.ok(afterRoles.user.roles.some((role) => role.key === 'ARTIST'));
    await call('GET', '/users', null, afterRoles.accessToken, 403);
    const track = await call(
      'POST',
      '/tracks',
      {
        title: 'Session test',
        description: 'Test track',
        releaseDate: '2026-10-17',
        bpm: { bpmFrom: 100, bpmTo: 120 },
      },
      afterRoles.accessToken,
      201,
    );
    await call(
      'PATCH',
      `/tracks/${track.id}`,
      { title: 'Blocked edit' },
      afterRoles.accessToken,
      403,
    );

    const deleted = await login();
    await prisma.user.delete({ where: { id: registered.user.id } });
    await me(deleted.accessToken, 401);
    await refresh(deleted.refreshToken, 401);
    assert.equal(await prisma.authSession.count(), 0);
    assert.equal(await prisma.refreshToken.count(), 0);
    console.log(
      `Auth sessions: ${checks} HTTP checks passed, including PostgreSQL rotation concurrency.`,
    );
  } finally {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (db) await db.end();
    if (created) {
      if (!/^sounds_auth_test_[a-f0-9]{32}$/.test(databaseName))
        throw new Error('Unexpected test database name');
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    }
    await admin.end();
  }
}

main().catch((error) => {
  // Do not print connection strings or credentials on connection/CLI failures.
  console.error(
    error instanceof Error
      ? error.message
      : 'Auth session integration test failed',
  );
  process.exitCode = 1;
});
