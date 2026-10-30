import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest, AuthResponse } from './auth.interfaces';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/permissions.decorator';
import type { UserResponse } from '../users/users.interfaces';
import { CreateUserDto } from './create-user.dto';
import { LoginUserDto } from './login-user.dto';
import { RefreshTokenDto } from './refresh-token.dto';
import { SessionsService } from './sessions.service';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: SessionsService,
  ) {}
  @Get('user/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users:read')
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
  @UseGuards(AuthRateLimitGuard)
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
  @UseGuards(AuthRateLimitGuard)
  async login(@Body() loginUserDto: LoginUserDto): Promise<AuthResponse> {
    return this.authService.login(loginUserDto);
  }

  @Post('refresh')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(200)
  refresh(@Body() body: RefreshTokenDto): Promise<AuthResponse> {
    return this.sessions.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Body() body: RefreshTokenDto): Promise<void> {
    return this.sessions.logout(body.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  logoutAll(@Req() request: AuthenticatedRequest): Promise<void> {
    return this.sessions.logoutAll(request.user.userId);
  }

  // Session discovery must also work for accounts without application roles.
  // JwtAuthGuard verifies the live session and active account in the database.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(
    @Req() request: AuthenticatedRequest,
  ): Promise<UserResponse & { sessionExpiresAt: Date }> {
    const user = await this.authService.findOne(request.user.userId);
    return { ...user, sessionExpiresAt: request.user.sessionExpiresAt };
  }
}
