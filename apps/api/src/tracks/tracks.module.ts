import { Module } from '@nestjs/common';
import { TracksController } from './tracks.controller';
import { TracksService } from './tracks.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { AudioModule } from '../audio/audio.module';
import { TrackUploadService } from './track-upload.service';
import { TrackAudioService } from './track-audio.service';
import { TemporaryUploadsService } from './temporary-uploads.service';

@Module({
  imports: [PermissionsModule, AudioModule],
  controllers: [TracksController],
  providers: [
    TracksService,
    TrackUploadService,
    TrackAudioService,
    TemporaryUploadsService,
  ],
})
export class TracksModule {}
