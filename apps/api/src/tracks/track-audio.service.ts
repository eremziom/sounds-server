import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { LocalAudioStorageService } from '../audio/local-audio-storage.service';
import { audioError } from '../audio/audio-errors';
import { API_ERROR_CODES } from '../common/api-errors';
import { parseAudioRange } from './audio-range';

@Injectable()
export class TrackAudioService {
  private readonly logger = new Logger(TrackAudioService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalAudioStorageService,
  ) {}

  async read(id: number, rangeHeader: string | undefined, response: Response) {
    response.setHeader('Cache-Control', 'private, no-store');
    const audio = await this.prisma.audioFile.findUnique({
      where: { trackId: id },
    });
    if (!audio) throw new NotFoundException('Track audio not found');
    const range =
      rangeHeader === undefined
        ? undefined
        : parseAudioRange(rangeHeader, audio.sizeBytes);
    response.setHeader('Accept-Ranges', 'bytes');
    if (range === null) {
      response.setHeader('Content-Range', `bytes */${audio.sizeBytes}`);
      throw new HttpException(
        {
          statusCode: 416,
          message: 'Invalid or unsatisfiable audio range',
          code: API_ERROR_CODES.audioRangeInvalid,
        },
        416,
      );
    }
    const { stream, sizeBytes } = await this.storage.openRead(
      audio.storageKey,
      range,
    );
    if (sizeBytes !== audio.sizeBytes) {
      stream.destroy();
      throw audioError('storage');
    }
    const closed = () => stream.destroy();
    response.once('close', closed);
    stream.once('close', () => response.removeListener('close', closed));
    if (response.destroyed) stream.destroy();
    response.status(range ? 206 : 200);
    if (range)
      response.setHeader(
        'Content-Range',
        `bytes ${range.start}-${range.end}/${sizeBytes}`,
      );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(stream, {
      type: audio.mimeType,
      length: range ? range.end - range.start + 1 : sizeBytes,
    }).setErrorHandler(() => {
      this.logger.error(`Audio stream failed for track ${id}`);
      if (response.destroyed) return;
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.removeHeader('Content-Range');
      response.removeHeader('Content-Length');
      response
        .status(503)
        .type('application/json')
        .send(audioError('storage').getResponse());
    });
  }
}
