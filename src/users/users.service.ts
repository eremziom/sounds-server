import { Injectable, NotFoundException } from "@nestjs/common";
import { UserResponse } from "./users.interfaces";

@Injectable()
export class UsersService {
  private users = [
    {
      id: 1,
      username: "max",
      email: "max@max.pl",
      bio: "bio",
      avatar: "avatar",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      username: "admin",
      email: "admin@admin.pl",
      bio: "bio",
      avatar: "avatar",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  findAll(): UserResponse[] {
    return this.users;
  }

  findOne(id: number): UserResponse {
    const user = this.users.find((user) => user.id === id);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }
}