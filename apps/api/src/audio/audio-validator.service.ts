export interface ValidatedAudioFormat {
  extension: 'mp3' | 'wav';
  mimeType: 'audio/mpeg' | 'audio/wav';
}

export abstract class AudioValidatorService {
  abstract validate(
    path: string,
    signal?: AbortSignal,
  ): Promise<ValidatedAudioFormat>;
}
