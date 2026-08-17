import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { CreateUserDto } from './create-user.dto';
import { LoginUserDto } from './login-user.dto';
import { UserResponse } from '../users/users.interfaces';
import { users } from '../mockup/users.mock';

const seedUsers = users.map((user) => ({ ...user }));
const resetUsers = () => {
  users.length = 0;
  users.push(...seedUsers.map((user) => ({ ...user })));
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    resetUsers();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('finds the user by id', () => {
    const result = service.findOne(1);
    expect(result.id).toBe(1);
  });

  it('throws when user is missing', () => {
    expect(() => service.findOne(999)).toThrow(NotFoundException);
  });

  it('registers a new user and hides the password', () => {
    const dto: CreateUserDto = {
      username: 'newcomer',
      password: 'Secret123!',
      email: 'new@example.com',
      bio: 'bio',
      avatar: 'https://example.com/avatar.png',
    };

    const created: UserResponse = service.register(dto);
    expect(created.id).toBeGreaterThan(seedUsers.length);
    expect('password' in created).toBe(false);
    expect(users).toHaveLength(seedUsers.length + 1);
  });

  it('rejects duplicate emails', () => {
    const dto: CreateUserDto = {
      username: 'max',
      password: 'Test123!',
      email: 'max@max.pl',
    };

    expect(() => service.register(dto)).toThrow(ConflictException);
  });

  it('logs in with username', () => {
    const dto: LoginUserDto = { login: 'admin', password: 'Test123!' };
    const response: UserResponse = service.login(dto);
    expect(response.username).toBe('admin');
    expect('password' in response).toBe(false);
  });

  it('fails login with wrong password', () => {
    const dto: LoginUserDto = { login: 'admin', password: 'wrong' };
    expect(() => service.login(dto)).toThrow(UnauthorizedException);
  });
});
