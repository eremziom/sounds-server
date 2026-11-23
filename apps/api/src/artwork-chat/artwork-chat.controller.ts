import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.interfaces';
import { CreatorChatDto } from './artwork-chat.dto';
import { ArtworkChatService } from './artwork-chat.service';

@Controller('artworks/projects/:projectId/chat')
@UseGuards(JwtAuthGuard)
export class ArtworkChatController {
  constructor(private readonly chat: ArtworkChatService) {}
  @Get('status') @Header('Cache-Control', 'private, no-store') status() {
    return this.chat.status();
  }
  @Post() @Header('Cache-Control', 'private, no-store') send(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreatorChatDto,
  ) {
    return this.chat.send(id, request.user.userId, dto);
  }
  @Post(':requestId/cancel') cancel(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) turn: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.chat.cancel(id, request.user.userId, turn);
  }
  @Post(':requestId/execute') execute(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) turn: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.chat.execute(id, request.user.userId, turn);
  }
  @Post(':requestId/apply/:jobId') apply(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) turn: string,
    @Param('jobId', new ParseUUIDPipe({ version: '4' })) jobId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.chat.apply(id, request.user.userId, turn, jobId);
  }
}
