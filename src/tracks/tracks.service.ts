import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateTrackDto } from './create-track.dto';
import { Track } from './tracks.interfaces';
import { tracks } from '../mockup/tracks.mock';

type UpdatableTrackFields = Pick<Track, 'title' | 'description' | 'bpm'>;

@Injectable()
export class TracksService {
  findAll(): Track[] {
    return tracks;
  }
  findOne(id: number): Track {
    const track = tracks.find((track) => track.id === id);
    if (!track) {
      throw new NotFoundException('Track not found');
    }
    return track;
  }

  create(createTrackDto: CreateTrackDto): Track {
    const newTrack: Track = {
      id: tracks.length + 1,
      ...createTrackDto,
    };
    tracks.push(newTrack);
    return newTrack;
  }

  update(id: number, data: Partial<UpdatableTrackFields>): Track {
    const track = tracks.find((track) => track.id === id);
    if (!track) {
      throw new NotFoundException('Track not found');
    }

    Object.assign(track, data);
    return track;
  }

  remove(id: number): void {
    const index = tracks.findIndex((track) => track.id === id);
    if (index === -1) {
      throw new NotFoundException('Track not found');
    }

    tracks.splice(index, 1);
  }
}
