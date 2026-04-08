import { Injectable, NotFoundException } from "@nestjs/common"
import { UserResponse, User } from "./users.interfaces"
import { users } from "../mockup/users.mock"

type UpdatableUserFields = Pick<User, 'username' | 'bio' | 'avatar'>;
@Injectable()
export class UsersService {
  /**
   * A private helper function to convert a User object
   * into a UserResponse object. This function is used
   * internally by the UsersService to return UserResponse
   * objects from functions that return User objects.
   */
    private toUserResponse(user: User): UserResponse {
    const { password, ...userResponse } = user
    return userResponse
  }
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

  remove(id: number): void {
    const index = users.findIndex((user) => user.id === id);
    if (index === -1) {
      throw new NotFoundException("User not found");
    }
    users.splice(index, 1);
  }

 update(id: number, data: Partial<UpdatableUserFields>): UserResponse {
    const user = users.find((user) => user.id === id)
    if (!user) {
      throw new NotFoundException('User not found')
    }

    const updatableKeys: (keyof UpdatableUserFields)[] = ['username', 'bio', 'avatar']
    updatableKeys.forEach((key) => {
      const value = data[key]
      if (value !== undefined) {
        user[key] = value
      }
    })
    user.updatedAt = new Date()
    return this.toUserResponse(user)
  }
}
