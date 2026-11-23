import { Module } from '@nestjs/common';
import { ArtworksController } from './artworks.controller';
import { ArtworksService } from './artworks.service';
import { ArtworkStorageService } from './artwork-storage.service';
import { ArtworkJobsModule } from '../artwork-jobs/artwork-jobs.module';
import { ArtworkStartersService } from './artwork-starters.service';
import { ArtworkStartersController } from './artwork-starters.controller';
import { ArtworkChatController } from '../artwork-chat/artwork-chat.controller';
import { ArtworkChatService } from '../artwork-chat/artwork-chat.service';
import { LocalCreatorModel } from '../artwork-chat/local-creator-model';

@Module({
  imports: [ArtworkJobsModule],
  controllers: [
    ArtworksController,
    ArtworkStartersController,
    ArtworkChatController,
  ],
  providers: [
    ArtworksService,
    ArtworkStorageService,
    ArtworkStartersService,
    ArtworkChatService,
    LocalCreatorModel,
  ],
})
export class ArtworksModule {}
