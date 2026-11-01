import { Module } from '@nestjs/common';
import { TracksController } from './tracks.controller';
import { TracksService } from './tracks.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { AudioModule } from '../audio/audio.module';

@Module({
  imports: [PermissionsModule, AudioModule],
  controllers: [TracksController],
  providers: [TracksService],
})
export class TracksModule {}
