import { Module } from '@nestjs/common';
import { ArtworksController } from './artworks.controller';
import { ArtworksService } from './artworks.service';
import { ArtworkStorageService } from './artwork-storage.service';
import { ArtworkJobsModule } from '../artwork-jobs/artwork-jobs.module';
import { ArtworkStartersService } from './artwork-starters.service';
import { ArtworkStartersController } from './artwork-starters.controller';

@Module({
  imports: [ArtworkJobsModule],
  controllers: [ArtworksController, ArtworkStartersController],
  providers: [ArtworksService, ArtworkStorageService, ArtworkStartersService],
})
export class ArtworksModule {}
