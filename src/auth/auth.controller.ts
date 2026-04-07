import { Controller, Get, Param, ParseIntPipe, Post, Body } from "@nestjs/common"
import { AuthService } from "./auth.service"
import type { UserRequest } from "../users/users.interfaces"
import { CreateUserDto } from "./create-user.dto"

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Get('user/:id')
  /**
   * Retrieves a user by their id.
   * @param {number} id The id of the user to be retrieved.
   * @returns {UserResponse} The user with the given id.
   * @throws {NotFoundException} If the user with the given id is not found.
   */
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.authService.findOne(id);
  }

  @Post('register')
  register(
    @Body() createUserDto: CreateUserDto): UserRequest {
    return this.authService.register(createUserDto)
  }
}
