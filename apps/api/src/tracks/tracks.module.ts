import { Module } from '@nestjs/common';
import { TracksController } from './tracks.controller';
import { TracksService } from './tracks.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { AudioModule } from '../audio/audio.module';
import { TrackUploadService } from './track-upload.service';

@Module({
  imports: [PermissionsModule, AudioModule],
  controllers: [TracksController],
  providers: [TracksService, TrackUploadService],
})
export class TracksModule {}
