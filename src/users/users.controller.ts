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
import { UpdateUserActiveDto } from './update-user-active.dto';
import { UpdateUserRoleDto } from './update-user-role.dto';
import type { UserResponse } from './users.interfaces';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  /**
   * Returns an array of all users.
   * @returns {User[]} An array of all users.
   */
  async findAll(): Promise<UserResponse[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  /**
   * Returns a user by their id.
   * @param {number} id The id of the user to be retrieved.
   * @returns {UserResponse} The user with the given id.
   * @throws {NotFoundException} If the user with the given id is not found.
   */
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<UserResponse> {
    return this.usersService.findOne(id);
  }

  @Delete(':id')
  /**
   * Removes a user by their id.
   * @param {number} id The id of the user to be removed.
   * @returns {void}
   * @throws {NotFoundException} If the user with the given id is not found.
   */
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
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
  ): Promise<UserResponse> {
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/role')
  updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserRoleDto: UpdateUserRoleDto,
  ): Promise<UserResponse> {
    return this.usersService.updateRole(id, updateUserRoleDto.role);
  }

  @Patch(':id/active')
  updateActive(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserActiveDto: UpdateUserActiveDto,
  ): Promise<UserResponse> {
    return this.usersService.updateActive(id, updateUserActiveDto.isActive);
  }
}
