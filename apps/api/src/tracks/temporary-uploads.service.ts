import { HttpException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocalAudioStorageService } from '../audio/local-audio-storage.service';
import { API_ERROR_CODES } from '../common/api-errors';
import type { CreateTrackDto } from './create-track.dto';
import type { AudioUpload } from '../generated/prisma/client.cjs';

function uploadError(kind: 'notFound' | 'consumed' | 'expired') {
  const [statusCode, code] = {
    notFound: [404, API_ERROR_CODES.audioUploadNotFound],
    consumed: [409, API_ERROR_CODES.audioUploadConsumed],
    expired: [410, API_ERROR_CODES.audioUploadExpired],
  }[kind];
  return new HttpException(
    { statusCode, code, message: code },
    statusCode as number,
  );
}

@Injectable()
export class TemporaryUploadsService {
  private readonly logger = new Logger(TemporaryUploadsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalAudioStorageService,
  ) {}

  async register(
    ownerId: number,
    file: Pick<
      AudioUpload,
      'storageKey' | 'originalName' | 'mimeType' | 'sizeBytes'
    >,
  ) {
    const upload = await this.prisma.audioUpload.create({
      data: {
        ...file,
        ownerId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return { uploadId: upload.id, expiresAt: upload.expiresAt.toISOString() };
  }

  private assertPending(upload: AudioUpload | null) {
    if (!upload || upload.status === 'CANCELLED') throw uploadError('notFound');
    if (upload.status === 'CONSUMED') throw uploadError('consumed');
    if (upload.status === 'EXPIRED' || upload.expiresAt.getTime() <= Date.now())
      throw uploadError('expired');
    return upload;
  }

  async complete(id: string, ownerId: number, dto: CreateTrackDto) {
    return this.prisma.$transaction(async (tx) => {
      // Conditional UPDATE locks the row. PostgreSQL rechecks its predicate after
      // waiting for a competing complete/cancel/expiry transaction to commit.
      const claimed = await tx.audioUpload.updateMany({
        where: {
          id,
          ownerId,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
        data: { status: 'CONSUMED' },
      });
      const upload = await tx.audioUpload.findFirst({ where: { id, ownerId } });
      if (!claimed.count) {
        this.assertPending(upload);
        throw uploadError('consumed');
      }
      if (!upload) throw uploadError('notFound');
      if (upload.expiresAt.getTime() <= Date.now())
        throw uploadError('expired');
      const track = await tx.track.create({
        data: {
          ownerId,
          title: dto.title,
          description: dto.description,
          releaseDate: new Date(dto.releaseDate),
          bpmFrom: dto.bpm.bpmFrom,
          bpmTo: dto.bpm.bpmTo,
          audioFile: {
            create: {
              storageKey: upload.storageKey,
              originalName: upload.originalName,
              mimeType: upload.mimeType,
              sizeBytes: upload.sizeBytes,
            },
          },
        },
      });
      return {
        id: track.id,
        ownerId: track.ownerId,
        hasAudio: true,
        title: track.title,
        description: track.description,
        releaseDate: track.releaseDate.toISOString().split('T')[0],
        bpm: { bpmFrom: track.bpmFrom, bpmTo: track.bpmTo },
      };
    });
  }

  async cancel(id: string, ownerId: number) {
    const upload = await this.prisma.$transaction(async (tx) => {
      await tx.audioUpload.updateMany({
        where: { id, ownerId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      const record = await tx.audioUpload.findFirst({ where: { id, ownerId } });
      if (!record) throw uploadError('notFound');
      if (record.status === 'CONSUMED') throw uploadError('consumed');
      return record;
    });
    await this.removeRetiredFile(upload);
  }

  // The TTL sweeper must use this transition, never unlink a PENDING file based
  // on an earlier SELECT. A completed upload's file belongs to AudioFile.
  async expire(id: string) {
    const upload = await this.prisma.$transaction(async (tx) => {
      await tx.audioUpload.updateMany({
        where: { id, status: 'PENDING', expiresAt: { lte: new Date() } },
        data: { status: 'EXPIRED' },
      });
      return tx.audioUpload.findUnique({ where: { id } });
    });
    if (
      upload &&
      (upload.status === 'EXPIRED' || upload.status === 'CANCELLED')
    )
      await this.removeRetiredFile(upload);
  }

  private async removeRetiredFile(upload: AudioUpload) {
    try {
      await this.storage.remove(upload.storageKey);
    } catch (error) {
      this.logger.error(
        `Audio upload cleanup required: uploadId=${upload.id} storageKey=${upload.storageKey}`,
      );
      throw error;
    }
  }
}
