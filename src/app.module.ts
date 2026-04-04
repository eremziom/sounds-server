import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TracksModule } from './tracks/tracks.module';

@Module({
  imports: [TracksModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
