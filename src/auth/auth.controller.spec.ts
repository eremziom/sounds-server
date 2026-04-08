import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthModule } from './auth.module';
import { CreateUserDto } from './create-user.dto';
import { LoginUserDto } from './login-user.dto';
import { UserResponse } from '../users/users.interfaces';
import { users } from '../mockup/users.mock';

const seedUsers = users.map((user) => ({ ...user }));
const resetUsers = () => {
  users.length = 0;
  users.push(...seedUsers.map((user) => ({ ...user })));
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    resetUsers();
    const module: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('returns a user by id', () => {
    expect(controller.findOne(1).id).toBe(1);
  });

  it('registers a user through controller', () => {
    const dto: CreateUserDto = {
      username: 'ctrl',
      password: 'Secret123!',
      email: 'ctrl@example.com',
    };

    const created: UserResponse = controller.register(dto);
    expect(created.id).toBeGreaterThan(seedUsers.length);
    expect((created as { password?: string }).password).toBeUndefined();
  });

  it('throws when register email exists', () => {
    const dto: CreateUserDto = {
      username: 'max',
      password: 'Test123!',
      email: 'max@max.pl',
    };

    expect(() => controller.register(dto)).toThrow(ConflictException);
  });

  it('logs in via controller', () => {
    const dto: LoginUserDto = { login: 'max', password: 'Test123!' };
    const response: UserResponse = controller.login(dto);
    expect(response.username).toBe('max');
    expect((response as { password?: string }).password).toBeUndefined();
  });

  it('throws unauthorized when login fails', () => {
    const dto: LoginUserDto = { login: 'max', password: 'badpass' };
    expect(() => controller.login(dto)).toThrow(UnauthorizedException);
  });

  it('throws not found for invalid id', () => {
    expect(() => controller.findOne(999)).toThrow(NotFoundException);
  });
});
