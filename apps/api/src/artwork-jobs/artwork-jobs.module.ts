import { Module } from '@nestjs/common';
import { ArtworkJobsController } from './artwork-jobs.controller';
import { ArtworkJobsService } from './artwork-jobs.service';
@Module({
  controllers: [ArtworkJobsController],
  providers: [ArtworkJobsService],
})
export class ArtworkJobsModule {}
