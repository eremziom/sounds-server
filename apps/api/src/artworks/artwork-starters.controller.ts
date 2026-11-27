import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.interfaces';
import { ArtworkStartersService } from './artwork-starters.service';

@Controller('artworks/projects/starter')
@UseGuards(JwtAuthGuard)
export class ArtworkStartersController {
  constructor(private readonly starters: ArtworkStartersService) {}
  @Post('night-garden') create(@Req() request: AuthenticatedRequest) {
    return this.starters.nightGarden(request.user.userId);
  }
}
