import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Body,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthResponse } from './auth.interfaces';
import type { UserResponse } from '../users/users.interfaces';
import { CreateUserDto } from './create-user.dto';
import { LoginUserDto } from './login-user.dto';

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
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<UserResponse> {
    return this.authService.findOne(id);
  }

  @Post('register')
  /**
   * Registers a new user with the given data.
   * @param {CreateUserDto} createUserDto The data of the user to be registered.
   * @returns {AuthResponse} The registered user and access token.
   * @throws {ConflictException} If the email is already in use.
   */
  async register(@Body() createUserDto: CreateUserDto): Promise<AuthResponse> {
    return this.authService.register(createUserDto);
  }

  @Post('login')
  async login(@Body() loginUserDto: LoginUserDto): Promise<AuthResponse> {
    return this.authService.login(loginUserDto);
  }
}
