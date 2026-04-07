import { Injectable, NotFoundException } from "@nestjs/common";
import { UserResponse } from "./users.interfaces";
import { users } from "../mockup/users.mock";

@Injectable()
export class UsersService {

  findAll(): UserResponse[] {
    return users;
  }

  findOne(id: number): UserResponse {
    const user = users.find((user) => user.id === id);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }
}