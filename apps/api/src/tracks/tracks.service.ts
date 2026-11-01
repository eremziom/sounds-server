import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateTrackDto } from './create-track.dto';
import { Track } from './tracks.interfaces';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client.cjs';

// Only load the relation identifier; storage details stay private to the API.
const trackInclude = { audioFile: { select: { id: true } } } as const;
type TrackWithAudio = Prisma.TrackGetPayload<{ include: typeof trackInclude }>;

type UpdatableTrackFields = Pick<
  Track,
  'title' | 'description' | 'bpm' | 'releaseDate'
>;

@Injectable()
export class TracksService {
  constructor(private readonly prisma: PrismaService) {}

  private mapToTrackResponse(track: TrackWithAudio): Track {
    return {
      id: track.id,
      ownerId: track.ownerId,
      hasAudio: track.audioFile !== null,
      title: track.title,
      description: track.description ?? null,
      releaseDate: track.releaseDate.toISOString().split('T')[0],
      bpm: {
        bpmFrom: track.bpmFrom,
        bpmTo: track.bpmTo,
      },
    };
  }
  async findAll(): Promise<Track[]> {
    const tracks = await this.prisma.track.findMany({
      include: trackInclude,
      orderBy: {
        id: 'asc',
      },
    });

    return tracks.map((track) => this.mapToTrackResponse(track));
  }
  async findOne(id: number): Promise<Track> {
    const track = await this.prisma.track.findUnique({
      where: { id },
      include: trackInclude,
    });

    if (!track) {
      throw new NotFoundException('Track not found');
    }

    return this.mapToTrackResponse(track);
  }

  async create(
    createTrackDto: CreateTrackDto,
    ownerId: number,
  ): Promise<Track> {
    const newTrack = await this.prisma.track.create({
      include: trackInclude,
      data: {
        ownerId,
        title: createTrackDto.title,
        description: createTrackDto.description,
        releaseDate: new Date(createTrackDto.releaseDate),
        bpmFrom: createTrackDto.bpm.bpmFrom,
        bpmTo: createTrackDto.bpm.bpmTo,
      },
    });

    return this.mapToTrackResponse(newTrack);
  }

  async createWithAudio(
    dto: CreateTrackDto,
    ownerId: number,
    audio: {
      storageKey: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
    },
  ): Promise<Track> {
    // Prisma nested writes atomically create both records in one transaction.
    const track = await this.prisma.track.create({
      include: trackInclude,
      data: {
        ownerId,
        title: dto.title,
        description: dto.description,
        releaseDate: new Date(dto.releaseDate),
        bpmFrom: dto.bpm.bpmFrom,
        bpmTo: dto.bpm.bpmTo,
        audioFile: { create: audio },
      },
    });
    return this.mapToTrackResponse(track);
  }

  async update(
    id: number,
    data: Partial<UpdatableTrackFields>,
  ): Promise<Track> {
    const existingTrack = await this.prisma.track.findUnique({
      where: { id },
    });

    if (!existingTrack) {
      throw new NotFoundException('Track not found');
    }

    const updatedTrack = await this.prisma.track.update({
      where: { id },
      include: trackInclude,
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.bpm?.bpmFrom !== undefined && { bpmFrom: data.bpm.bpmFrom }),
        ...(data.bpm?.bpmTo !== undefined && { bpmTo: data.bpm.bpmTo }),
        ...(data.releaseDate !== undefined && {
          releaseDate: new Date(data.releaseDate),
        }),
      },
    });

    return this.mapToTrackResponse(updatedTrack);
  }

  async remove(id: number): Promise<void> {
    const existingTrack = await this.prisma.track.findUnique({
      where: { id },
    });

    if (!existingTrack) {
      throw new NotFoundException('Track not found');
    }

    await this.prisma.track.delete({
      where: { id },
    });
  }
}
