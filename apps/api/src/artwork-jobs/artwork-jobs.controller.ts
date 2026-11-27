import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.interfaces';
import { ArtworkPageDto } from '../artworks/artwork.dto';
import { CreateArtworkJobDto } from './artwork-job.dto';
import { ArtworkJobsService } from './artwork-jobs.service';
@Controller('artworks')
@UseGuards(JwtAuthGuard)
export class ArtworkJobsController {
  constructor(private readonly jobs: ArtworkJobsService) {}
  @Get('tools') @Header('Cache-Control', 'private, no-store') tools() {
    return this.jobs.registry();
  }
  @Post('projects/:projectId/jobs') enqueue(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) p: string,
    @Req() r: AuthenticatedRequest,
    @Body() dto: CreateArtworkJobDto,
  ) {
    return this.jobs.enqueue(p, r.user.userId, dto);
  }
  @Get('projects/:projectId/jobs')
  @Header('Cache-Control', 'private, no-store')
  list(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) p: string,
    @Req() r: AuthenticatedRequest,
    @Query() page: ArtworkPageDto,
  ) {
    return this.jobs.list(p, r.user.userId, page.cursor);
  }
  @Get('projects/:projectId/jobs/:id')
  @Header('Cache-Control', 'private, no-store')
  get(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) p: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.jobs.get(p, r.user.userId, id);
  }
  @Post('projects/:projectId/jobs/:id/cancel') cancel(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) p: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.jobs.cancel(p, r.user.userId, id);
  }
  @Post('projects/:projectId/jobs/:id/retry') retry(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) p: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.jobs.retry(p, r.user.userId, id);
  }
}
