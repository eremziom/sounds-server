import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateTrackDto } from './create-track.dto';
import { Track } from './tracks.interfaces';
import { tracks } from '../mockup/tracks.mock';
import { PrismaService } from '../prisma/prisma.service';

type UpdatableTrackFields = Pick<Track, 'title' | 'description' | 'bpm' | 'releaseDate'>;

@Injectable()
export class TracksService {
  constructor(private readonly prisma: PrismaService) {}

  private mapToTrackResponse(track: {
    id: number;
    title: string;
    description: string | null;
    releaseDate: Date;
    bpmFrom: number;
    bpmTo: number;
  }): Track {
    return {
      id: track.id,
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
      orderBy: {
        id: 'asc',
      },
    });

    return tracks.map((track) => this.mapToTrackResponse(track));
  }
  async findOne(id: number): Promise<Track> {
    const track = await this.prisma.track.findUnique({
      where: { id },
    });

    if (!track) {
      throw new NotFoundException('Track not found');
    }

    return this.mapToTrackResponse(track);
  }

  async create(createTrackDto: CreateTrackDto): Promise<Track> {
    const newTrack = await this.prisma.track.create({
      data: {
        title: createTrackDto.title,
        description: createTrackDto.description,
        releaseDate: new Date(createTrackDto.releaseDate),
        bpmFrom: createTrackDto.bpm.bpmFrom,
        bpmTo: createTrackDto.bpm.bpmTo,
      },
    });

    return this.mapToTrackResponse(newTrack);
  }

  async update(id: number, data: Partial<UpdatableTrackFields>): Promise<Track> {
    const existingTrack = await this.prisma.track.findUnique({
      where: { id },
    });

    if (!existingTrack) {
      throw new NotFoundException('Track not found');
    }

    const updatedTrack = await this.prisma.track.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.bpm?.bpmFrom !== undefined && { bpmFrom: data.bpm.bpmFrom }),
        ...(data.bpm?.bpmTo !== undefined && { bpmTo: data.bpm.bpmTo }),
        ...(data.releaseDate !== undefined && { releaseDate: new Date(data.releaseDate) }),
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
