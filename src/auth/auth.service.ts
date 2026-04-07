import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '../users/users.interfaces';

@Injectable ()
export class AuthService {
  private users: User[] = [
    {
      id: 1,
      username: 'max',
      password: 'Test123!',
      email: 'max@max.pl',
      bio: 'bio',
      avatar: 'avatar',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  
  findAll(): User[] {
    return this.users;
  }
}
