import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateTrackDto } from './create-track.dto';
import type { BpmRangeDto } from './bpm-range.dto';

export interface Track {
  id: number;
  title: string;
  description: string;
  releaseDate: string;
  bpm: BpmRangeDto;
}

type UpdatableTrackFields = Pick<Track, 'title' | 'description' | 'bpm'>;

@Injectable()
export class TracksService {
  private tracks: Track[] = [
    {
      id: 1,
      title: 'Psylogy',
      description: 'Driving psytrance riddled with analog synths',
      releaseDate: '2024-01-01',
      bpm: { bpmFrom: 135, bpmTo: 140 },
    },
    {
      id: 2,
      title: 'Psytechnica',
      description: 'Rounded bass and modular textures for the dancefloor',
      releaseDate: '2024-06-14',
      bpm: { bpmFrom: 140, bpmTo: 145 },
    },
  ];

  findAll(): Track[] {
    return this.tracks
  }
  findOne(id: number): Track {
    const track = this.tracks.find((track) => track.id === id)
    if (!track) {
      throw new NotFoundException('Track not found');
    }
    return track
  }

  create(createTrackDto: CreateTrackDto): Track {
    const newTrack: Track = {
      id: this.tracks.length + 1,
      ...createTrackDto,
    };
    this.tracks.push(newTrack)
    return newTrack;
  }

  update(id: number, data: Partial<UpdatableTrackFields>): Track {
    const track = this.tracks.find((track) => track.id === id)
    if (!track) {
      throw new NotFoundException('Track not found');
    }

    Object.assign(track, data);
    return track;
  }

  remove(id: number): void {
    const index = this.tracks.findIndex((track) => track.id === id)
    if (index === -1) {
      throw new NotFoundException('Track not found');
    }

    this.tracks.splice(index, 1)
  }
}
