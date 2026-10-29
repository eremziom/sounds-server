/* Runs against a freshly created temporary database, never against app data. */
const assert = require('node:assert/strict');
const { randomUUID, createHash, createHmac } = require('node:crypto');
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
    process.env.AUTH_PROXY_SECRET = randomUUID();
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
    const seed = readFileSync(path.resolve('prisma/seed-rbac.sql'), 'utf8');
    await db.query(seed);
    async function rbacSnapshot() {
      const roles = await db.query(
        'SELECT id, key, name, description FROM "Role" ORDER BY key',
      );
      const permissions = await db.query(
        'SELECT id, key, name, description FROM "Permission" ORDER BY key',
      );
      const grants = await db.query(
        'SELECT "roleId", "permissionId" FROM "RolePermission" ORDER BY "roleId", "permissionId"',
      );
      return {
        roles: roles.rows,
        permissions: permissions.rows,
        grants: grants.rows,
      };
    }
    const initialRbac = await rbacSnapshot();
    assert.deepEqual(
      initialRbac.roles.map((role) => role.key),
      ['ADMIN', 'ARTIST', 'USER'],
    );
    assert.equal(initialRbac.permissions.length, 19);
    assert.equal(initialRbac.grants.length, 28);
    // Reproduce the legacy over-grants and verify that the seed repairs them.
    const legacyGrants = await db.query(`
      INSERT INTO "RolePermission" ("roleId", "permissionId")
      SELECT r.id, p.id FROM "Role" r CROSS JOIN "Permission" p
      WHERE r.key IN ('USER', 'ARTIST') AND p.key IN ('users:read', 'users:update')
      ON CONFLICT DO NOTHING
    `);
    assert.equal(legacyGrants.rowCount, 4);
    await db.query(seed);
    assert.deepEqual(
      await rbacSnapshot(),
      initialRbac,
      'Seed must revoke legacy global profile grants',
    );
    await db.query(seed);
    assert.deepEqual(
      await rbacSnapshot(),
      initialRbac,
      'Repeated seed must preserve RBAC records and assignments',
    );

    const { NestFactory } = require('@nestjs/core');
    const {
      createApiValidationPipe,
    } = require('../dist/src/common/api-validation.pipe.js');
    const { AppModule } = require('../dist/src/app.module.js');
    const { PrismaService } = require('../dist/src/prisma/prisma.service.js');
    const { UsersService } = require('../dist/src/users/users.service.js');
    const { JwtService } = require('@nestjs/jwt');
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(createApiValidationPipe());
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    const users = app.get(UsersService);
    const baseUrl = await app.getUrl();
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const { readRotationResult, sealRotationResult } = require('../dist/src/auth/rotation-result.js');
    async function expireRotation(sessionId) {
      const session = await prisma.authSession.findUniqueOrThrow({ where: { id: sessionId } });
      const result = readRotationResult(session.rotationResult, process.env.JWT_SECRET, sessionId);
      assert.ok(result);
      result.validUntil = Date.now() - 1;
      await prisma.authSession.update({
        where: { id: sessionId },
        data: { rotationResult: sealRotationResult(result, process.env.JWT_SECRET, sessionId) },
      });
    }

    async function call(method, route, body, token, expected, extraHeaders = {}) {
      const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers: {
          ...extraHeaders,
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

    const sourceHeaders = (ip) => {
      const payload = `${Date.now()}.${Buffer.from(ip).toString('base64url')}`;
      return { 'X-Sounds-Client-Source': `${payload}.${createHmac('sha256', process.env.AUTH_PROXY_SECRET).update(payload).digest('hex')}` };
    };
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
    const badRegistration = await call(
      'POST',
      '/auth/register',
      {
        username: 'x',
        email: 'invalid',
        password: 'short',
      },
      null,
      400,
    );
    assert.equal(badRegistration.code, 'VALIDATION_FAILED');
    assert.ok(
      badRegistration.fieldErrors.some(
        (error) => error.field === 'username' && error.code === 'LENGTH',
      ),
    );
    const duplicate = await call(
      'POST',
      '/auth/register',
      {
        username: 'session-tester',
        email: 'sessions@example.com',
        password: 'Test123!',
      },
      null,
      409,
    );
    assert.equal(duplicate.code, 'EMAIL_ALREADY_IN_USE');
    const wrongPassword = await call(
      'POST',
      '/auth/login',
      {
        login: 'session-tester',
        password: 'Wrong123!',
      },
      null,
      401,
    );
    assert.equal(wrongPassword.code, 'AUTH_INVALID_CREDENTIALS');
    assert.match(registered.refreshToken, /^[a-f0-9]{64}$/);
    const initialPayload = jwt.verify(registered.accessToken);
    assert.equal(initialPayload.exp - initialPayload.iat, 900);
    await me(registered.accessToken);
    const profileTarget = await call(
      'POST',
      '/auth/register',
      {
        username: 'profile-target',
        email: 'profile-target@example.com',
        password: 'Test123!',
      },
      null,
      201,
    );
    async function checkProfileAccess(token, expected) {
      await call(
        'GET',
        `/users/${profileTarget.user.id}`,
        null,
        token,
        expected,
      );
      await call(
        'GET',
        `/auth/user/${profileTarget.user.id}`,
        null,
        token,
        expected,
      );
      await call(
        'PATCH',
        `/users/${profileTarget.user.id}`,
        { bio: 'Admin-managed profile' },
        token,
        expected,
      );
    }
    await call('GET', '/users', null, registered.accessToken, 403);
    await checkProfileAccess(registered.accessToken, 403);
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
    assert.deepEqual(await refresh(registered.refreshToken), rotated, 'A duplicate within grace returns the original pair');
    assert.deepEqual(await refresh(rotated.refreshToken), rotated, 'The replacement cannot rotate again during grace');
    await expireRotation(initialPayload.sid);
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
    assert.deepEqual(attempts.map((entry) => entry.status), [200, 200]);
    assert.deepEqual(attempts[0].data, attempts[1].data);
    const concurrencySession = await prisma.authSession.findUnique({
      where: { id: jwt.verify(concurrent.accessToken).sid },
    });
    assert.equal(concurrencySession.revokedAt, null);
    assert.ok(concurrencySession.rotationResult);
    assert.ok(!concurrencySession.rotationResult.includes(attempts[0].data.refreshToken));
    const issued = await prisma.refreshToken.findMany({
      where: { sessionId: concurrencySession.id },
    });
    assert.equal(issued.length, 2);
    assert.equal(issued.filter((entry) => entry.usedAt).length, 1);
    const winner = attempts[0].data;
    await me(winner.accessToken);
    await me(concurrent.accessToken);
    assert.deepEqual(await refresh(winner.refreshToken), winner);
    // A separate service instance reads the same result from PostgreSQL.
    const { SessionsService } = require('../dist/src/auth/sessions.service.js');
    const { ConfigService } = require('@nestjs/config');
    const otherInstance = new SessionsService(prisma, app.get(JwtService), app.get(ConfigService));
    const duplicateRotation = await otherInstance.refresh(concurrent.refreshToken);
    assert.deepEqual(JSON.parse(JSON.stringify(duplicateRotation)), winner);
    await expireRotation(concurrencySession.id);
    const following = await refresh(winner.refreshToken);
    assert.notEqual(following.refreshToken, winner.refreshToken);
    await me(following.accessToken);
    await refresh(concurrent.refreshToken, 401);
    await me(following.accessToken, 401);

    // Cached success must not bypass logout, expiry or deactivation.
    const cachedLogout = await login();
    const cachedPair = await refresh(cachedLogout.refreshToken);
    await logout(cachedLogout.refreshToken);
    await refresh(cachedLogout.refreshToken, 401);
    await refresh(cachedPair.refreshToken, 401);
    const cachedLogoutAll = await login();
    const allPair = await refresh(cachedLogoutAll.refreshToken);
    await call('POST', '/auth/logout-all', null, allPair.accessToken, 204);
    await refresh(cachedLogoutAll.refreshToken, 401);
    await refresh(allPair.refreshToken, 401);
    const cachedExpiry = await login();
    await refresh(cachedExpiry.refreshToken);
    await prisma.authSession.update({
      where: { id: jwt.verify(cachedExpiry.accessToken).sid },
      data: { expiresAt: new Date(0) },
    });
    await refresh(cachedExpiry.refreshToken, 401);

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
    await refresh(logoutRace.refreshToken);
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
    await refresh(beforeDeactivation.refreshToken);
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
    await checkProfileAccess(afterRoles.accessToken, 403);
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

    const adminRole = await prisma.role.findUnique({ where: { key: 'ADMIN' } });
    await prisma.userRole.create({
      data: { userId: registered.user.id, roleId: adminRole.id },
    });
    const adminSession = await refresh(afterRoles.refreshToken);
    assert.ok(adminSession.user.roles.some((role) => role.key === 'ADMIN'));
    await call('GET', '/users', null, adminSession.accessToken, 200);
    await checkProfileAccess(adminSession.accessToken, 200);
    await call('GET', '/roles', null, adminSession.accessToken, 200);
    await call('GET', '/permissions', null, adminSession.accessToken, 200);
    await prisma.user.delete({ where: { id: profileTarget.user.id } });

    const deleted = await login();
    await prisma.user.delete({ where: { id: registered.user.id } });
    await me(deleted.accessToken, 401);
    await refresh(deleted.refreshToken, 401);
    assert.equal(await prisma.authSession.count(), 0);
    assert.equal(await prisma.refreshToken.count(), 0);

    const limitAccount = await call('POST', '/auth/register', {
      username: 'limit-account', email: 'limits@example.com', password: 'Secret123!',
    }, null, 201);
    const limitedLogin = (login, password, status) => call('POST', '/auth/login', { login, password }, null, status);
    for (let attempt = 1; attempt <= 4; attempt++) {
      const failure = await limitedLogin(attempt % 2 ? 'limit-account' : 'limits@example.com', 'Wrong123!', 401);
      assert.equal(failure.code, attempt === 4 ? 'AUTH_LAST_LOGIN_ATTEMPT' : 'AUTH_INVALID_CREDENTIALS');
    }
    await limitedLogin('limits@example.com', 'Secret123!', 201); // Fifth may succeed, resets failures.
    for (let attempt = 1; attempt <= 5; attempt++) {
      const failure = await limitedLogin('limit-account', 'Wrong123!', attempt === 5 ? 429 : 401);
      assert.equal(failure.code, attempt === 5 ? 'AUTH_LOGIN_LOCKED' : attempt === 4 ? 'AUTH_LAST_LOGIN_ATTEMPT' : 'AUTH_INVALID_CREDENTIALS');
    }
    const loginKey = createHash('sha256').update(`login-account\0user:${limitAccount.user.id}`).digest('hex');
    const blocked = await prisma.authRateLimit.findUniqueOrThrow({ where: { key: loginKey } });
    const locked = await limitedLogin('limits@example.com', 'Secret123!', 429);
    assert.equal(locked.code, 'AUTH_LOGIN_LOCKED');
    assert.ok(locked.retryAfterSeconds > 0 && locked.retryAfterSeconds <= 900);
    assert.equal((await prisma.authRateLimit.findUniqueOrThrow({ where: { key: loginKey } })).resetAt.getTime(), blocked.resetAt.getTime(), 'Retries must not extend the lock');
    await prisma.authRateLimit.update({ where: { key: loginKey }, data: { resetAt: new Date(0) } });
    await limitedLogin('limit-account', 'Secret123!', 201);
    const parallel = await Promise.all(Array.from({ length: 10 }, () => call('POST', '/auth/login', { login: 'limit-account', password: 'Wrong123!' })));
    assert.equal(parallel.filter((response) => response.status === 401).length, 4);
    assert.equal(parallel.filter((response) => response.status === 429).length, 6);
    assert.equal((await prisma.authRateLimit.findUniqueOrThrow({ where: { key: loginKey } })).count, 5);
    for (let attempt = 1; attempt <= 5; attempt++) {
      const failure = await limitedLogin('missing-limit-account', 'Wrong123!', attempt === 5 ? 429 : 401);
      assert.equal(failure.code, attempt === 5 ? 'AUTH_LOGIN_LOCKED' : attempt === 4 ? 'AUTH_LAST_LOGIN_ATTEMPT' : 'AUTH_INVALID_CREDENTIALS');
    }
    // Limits are independent of frontend state/cookies and shared by API instances.
    const { AuthLimitsService } = require('../dist/src/auth/auth-limits.service.js');
    const anotherLimits = new AuthLimitsService(prisma);
    await assert.rejects(anotherLimits.login(`user:${limitAccount.user.id}`, () => assert.fail('Locked credentials must not be checked')),
      (error) => error.getStatus() === 429);
    for (const [operation, limit] of [['login', 100], ['register', 20], ['refresh', 120]]) {
      const headers = sourceHeaders('192.0.2.101');
      for (let attempt = 0; attempt < limit; attempt++) await call('POST', `/auth/${operation}`, {}, null, 400, headers);
      const limited = await call('POST', `/auth/${operation}`, {}, null, 429, headers);
      assert.equal(limited.code, 'AUTH_RATE_LIMITED');
      await call('POST', `/auth/${operation}`, {}, null, 400, sourceHeaders('192.0.2.102'));
    }
    console.log(
      `Auth sessions: ${checks} HTTP checks passed, including PostgreSQL rotation concurrency and RBAC. Seed repair/idempotence verified (3 roles, 19 permissions, 28 grants). USER/ARTIST denied cross-profile access; ADMIN allowed.`,
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
