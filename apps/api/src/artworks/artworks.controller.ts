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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.interfaces';
import {
  ArtifactMetadataDto,
  ArtworkPageDto,
  CreateMessageDto,
  CreateProjectDto,
  CreateRevisionDto,
  RestoreRevisionDto,
} from './artwork.dto';
import { ArtworksService } from './artworks.service';
import { ARTIFACT_MAX_BYTES } from './artwork-storage.service';
import { invalidArtwork } from './artwork-snapshot';

@Controller('artworks/projects')
@UseGuards(JwtAuthGuard)
export class ArtworksController {
  constructor(private readonly artworks: ArtworksService) {}

  @Post() create(
    @Req() r: AuthenticatedRequest,
    @Body() dto: CreateProjectDto,
  ) {
    return this.artworks.create(r.user.userId, dto.title);
  }
  @Get() @Header('Cache-Control', 'private, no-store') list(
    @Req() r: AuthenticatedRequest,
    @Query() page: ArtworkPageDto,
  ) {
    return this.artworks.list(r.user.userId, page.cursor);
  }
  @Get(':projectId') @Header('Cache-Control', 'private, no-store') get(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) p: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.artworks.get(p, r.user.userId);
  }
  @Get(':projectId/revisions')
  @Header('Cache-Control', 'private, no-store')
  history(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) p: string,
    @Req() r: AuthenticatedRequest,
    @Query() page: ArtworkPageDto,
  ) {
    return this.artworks.history(p, r.user.userId, page.cursor);
  }
  @Get(':projectId/revisions/:id')
  @Header('Cache-Control', 'private, no-store')
  revision(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) p: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.artworks.revision(p, r.user.userId, id);
  }
  @Post(':projectId/revisions') save(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) p: string,
    @Req() r: AuthenticatedRequest,
    @Body() dto: CreateRevisionDto,
  ) {
    return this.artworks.save(p, r.user.userId, dto);
  }
  @Post(':projectId/restore') restore(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) p: string,
    @Req() r: AuthenticatedRequest,
    @Body() dto: RestoreRevisionDto,
  ) {
    return this.artworks.restore(
      p,
      r.user.userId,
      dto.baseRevisionId,
      dto.revisionId,
    );
  }
  @Get(':projectId/artifacts')
  @Header('Cache-Control', 'private, no-store')
  artifacts(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) p: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.artworks.artifacts(p, r.user.userId);
  }
  @Post(':projectId/artifacts')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: ARTIFACT_MAX_BYTES,
        files: 1,
        fields: 1,
        fieldSize: 20000,
        // Busboy emits partsLimit when it reaches this count (including valid parts).
        parts: 3,
      },
    }),
  )
  async upload(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) p: string,
    @Req() r: AuthenticatedRequest,
    @Body() body: { metadata?: string },
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.metadata ?? '');
    } catch {
      throw invalidArtwork('metadata must be JSON');
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !file?.buffer
    )
      throw invalidArtwork('metadata and file are required');
    const meta = plainToInstance(ArtifactMetadataDto, parsed);
    if (
      (await validate(meta, { whitelist: true, forbidNonWhitelisted: true }))
        .length
    )
      throw invalidArtwork('Invalid artifact metadata');
    return this.artworks.upload(p, r.user.userId, meta, file.buffer);
  }
  @Get(':projectId/artifacts/:id/file')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  file(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) p: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.artworks.file(p, r.user.userId, id);
  }
  @Get(':projectId/messages')
  @Header('Cache-Control', 'private, no-store')
  messages(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) p: string,
    @Req() r: AuthenticatedRequest,
    @Query() page: ArtworkPageDto,
  ) {
    return this.artworks.messages(p, r.user.userId, page.cursor);
  }
  @Post(':projectId/messages') message(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) p: string,
    @Req() r: AuthenticatedRequest,
    @Body() dto: CreateMessageDto,
  ) {
    return this.artworks.message(p, r.user.userId, dto.text);
  }
}
