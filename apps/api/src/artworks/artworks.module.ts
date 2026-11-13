import { Module } from '@nestjs/common';
import { ArtworksController } from './artworks.controller';
import { ArtworksService } from './artworks.service';
import { ArtworkStorageService } from './artwork-storage.service';

@Module({
  controllers: [ArtworksController],
  providers: [ArtworksService, ArtworkStorageService],
})
export class ArtworksModule {}
