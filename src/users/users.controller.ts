import {
  Controller,
  Param,
  Get,
  ParseIntPipe,
  Delete,
  Patch,
  Body,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './update-user.dto';
import type { UserResponse } from './users.interfaces';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  /**
   * Returns an array of all users.
   * @returns {User[]} An array of all users.
   */
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  /**
   * Returns a user by their id.
   * @param {number} id The id of the user to be retrieved.
   * @returns {UserResponse} The user with the given id.
   * @throws {NotFoundException} If the user with the given id is not found.
   */
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Delete(':id')
  /**
   * Removes a user by their id.
   * @param {number} id The id of the user to be removed.
   * @returns {void}
   * @throws {NotFoundException} If the user with the given id is not found.
   */
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }

  @Patch(':id')
  /**
   * Updates a user by their id.
   * @param {number} id The id of the user to be updated.
   * @param {UpdateUserDto} updateUserDto The user data to be updated.
   * @returns {UserResponse} The updated user.
   * @throws {NotFoundException} If the user with the given id is not found.
   */
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ): UserResponse {
    return this.usersService.update(id, updateUserDto);
  }
}
