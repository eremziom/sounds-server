import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AudioValidatorService } from './audio-validator.service';
import { BuiltinAudioValidatorService } from './builtin-audio-validator.service';
import { LocalAudioStorageService } from './local-audio-storage.service';

@Module({
  imports: [ConfigModule],
  providers: [
    LocalAudioStorageService,
    { provide: AudioValidatorService, useClass: BuiltinAudioValidatorService },
  ],
  exports: [LocalAudioStorageService],
})
export class AudioModule {}
