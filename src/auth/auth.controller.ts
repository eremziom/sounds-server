import { Controller, Get } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Get()
  /**
   * Returns all users.
   *
   * @returns {User[]} An array of all users.
   */
  findAll() {
    return this.authService.findAll();
  }
}
