import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  INestApplication,
  Post,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { CreateUserDto } from '../auth/create-user.dto';
import { LoginUserDto } from '../auth/login-user.dto';
import { API_ERROR_CODES, codedError } from './api-errors';
import { ApiExceptionFilter } from './api-exception.filter';
import {
  createApiValidationPipe,
  normalizeValidationErrors,
} from './api-validation.pipe';

@Controller('contract')
class ContractController {
  @Post('register')
  register(@Body() body: CreateUserDto) {
    return { username: body.username };
  }

  @Post('login')
  login(@Body() body: LoginUserDto) {
    return { login: body.login };
  }

  @Get('conflict')
  conflict() {
    throw new ConflictException(
      codedError(
        new ConflictException('Email already in use'),
        API_ERROR_CODES.emailAlreadyInUse,
      ),
    );
  }

  @Get('forbidden')
  forbidden() {
    throw new ForbiddenException('Missing required permission');
  }

  @Get('unauthorized')
  unauthorized() {
    throw new UnauthorizedException();
  }

  @Get('unprocessable')
  unprocessable() {
    throw new HttpException('Cannot process this request', 422);
  }
}

describe('API error HTTP contract', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ContractController],
      providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(createApiValidationPipe());
    await app.init();
    server = app.getHttpServer() as Server;
  });
  afterAll(async () => {
    await app.close();
  });

  it('adds codes without changing status, message or error and ignores language headers', async () => {
    for (const language of ['en', 'pl', 'es']) {
      for (const [route, status, message, error, code] of [
        [
          'conflict',
          409,
          'Email already in use',
          'Conflict',
          'EMAIL_ALREADY_IN_USE',
        ],
        [
          'forbidden',
          403,
          'Missing required permission',
          'Forbidden',
          'ACCESS_DENIED',
        ],
        ['unauthorized', 401, 'Unauthorized', undefined, 'AUTH_REQUIRED'],
        [
          'unprocessable',
          422,
          'Cannot process this request',
          undefined,
          'HTTP_ERROR',
        ],
      ] as const) {
        const response = await request(server)
          .get(`/contract/${route}`)
          .set('Accept-Language', language)
          .expect(status);
        expect(response.body).toEqual({
          statusCode: status,
          message,
          ...(error ? { error } : {}),
          code,
        });
      }
    }
  });

  it('preserves legacy validation messages and adds safe rule codes with numeric bounds', async () => {
    const body = {
      username: 'a',
      email: 'bad',
      password: 'secret-value',
      extra: 'private-token',
    };
    const legacy = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    let legacyBody: unknown;
    try {
      await legacy.transform(
        { ...body },
        { type: 'body', metatype: CreateUserDto },
      );
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      legacyBody = error.getResponse();
    }
    const response = await request(server)
      .post('/contract/register')
      .send(body)
      .expect(400);
    const result = response.body as { fieldErrors: unknown[] };
    expect(response.body).toMatchObject({
      ...(legacyBody as object),
      code: 'VALIDATION_FAILED',
    });
    expect(result.fieldErrors).toEqual(
      expect.arrayContaining([
        { field: 'username', code: 'LENGTH', params: { min: 3, max: 30 } },
        { field: 'email', code: 'EMAIL' },
        { field: 'password', code: 'PASSWORD_COMPLEXITY' },
        { field: 'extra', code: 'UNKNOWN_FIELD' },
      ]),
    );
    expect(JSON.stringify(result.fieldErrors)).not.toMatch(
      /secret-value|private-token|target|constraints/,
    );
  });

  it('uses login-specific limits and still accepts valid DTOs', async () => {
    const response = await request(server)
      .post('/contract/login')
      .send({ login: 'ab', password: 'short' })
      .expect(400);
    expect((response.body as { fieldErrors: unknown[] }).fieldErrors).toEqual(
      expect.arrayContaining([
        { field: 'login', code: 'LENGTH', params: { min: 3, max: 100 } },
        { field: 'password', code: 'LENGTH', params: { min: 8, max: 50 } },
      ]),
    );
    await request(server)
      .post('/contract/register')
      .send({
        username: 'user',
        email: 'user@example.com',
        password: 'Valid123!',
      })
      .expect(201);
  });

  it('normalizes nested and unknown rules without including supplied values or arbitrary contexts', () => {
    expect(
      normalizeValidationErrors([
        {
          property: 'profile',
          children: [
            {
              property: 'name',
              value: 'private',
              constraints: { customRule: 'private message' },
              contexts: { customRule: { token: 'private' } },
            },
          ],
        },
      ]),
    ).toEqual([{ field: 'profile.name', code: 'INVALID_VALUE' }]);
  });
});
