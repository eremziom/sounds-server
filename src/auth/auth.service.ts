import { Injectable, NotFoundException } from '@nestjs/common';
import { UserResponse, UserRequest } from '../users/users.interfaces';
import { users } from '../mockup/users.mock';

@Injectable ()
export class AuthService {

  findOne(id: number): UserResponse {
    const user = users.find((user) => user.id === id)
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user
  }
  register(user: UserRequest): UserRequest {
    const newUser = {
      id: users.length + 1,
      ...user,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    users.push(newUser);
    return newUser;
  }
}
