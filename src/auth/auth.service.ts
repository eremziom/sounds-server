import { Injectable, NotFoundException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { UserResponse, User } from '../users/users.interfaces';
import { users } from '../mockup/users.mock';
import { CreateUserDto } from './create-user.dto';
import { LoginUserDto } from './login-user.dto';

@Injectable ()
export class AuthService {
   private toUserResponse(user: User): UserResponse {
    const { password, ...userResponse } = user
    return userResponse
  }

  findOne(id: number): UserResponse {
    const user = users.find((user) => user.id === id)
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user
  }

  register(data: CreateUserDto): UserResponse {
    const existingUser = users.find((user) => user.email === data.email)

    if (existingUser) {
      throw new ConflictException('Email already in use')
    }

    const newUser: User = {
      id: users.length + 1,
      username: data.username,
      email: data.email,
      password: data.password,
      bio: data.bio,
      avatar: data.avatar,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    users.push(newUser)

    return this.toUserResponse(newUser)
  }

  login(data: LoginUserDto): UserResponse {
    const user = users.find(
    (user) =>
      user.email === data.login || user.username === data.login,
    )

    if (!user || user.password !== data.password) {
      throw new UnauthorizedException('Invalid credentials')
    }

    return this.toUserResponse(user)
  }
}
