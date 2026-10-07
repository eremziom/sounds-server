import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { TracksController } from './tracks.controller';
import { CreateTrackDto } from './create-track.dto';
import { UpdateTrackDto } from './update-track.dto';
import { TracksService } from './tracks.service';
import { Track } from './tracks.interfaces';

const initialTracks: Track[] = [
  {
    id: 1,
    title: 'Solar Drift',
    releaseDate: '2024-01-01',
    description: 'Driving psy with warm bass',
    bpm: { bpmFrom: 128, bpmTo: 132 },
  },
  {
    id: 2,
    title: 'Night Pulse',
    releaseDate: '2024-02-01',
    description: 'Dark rolling groove',
    bpm: { bpmFrom: 134, bpmTo: 138 },
  },
];

describe('TracksController', () => {
  let controller: TracksController;
  let tracks: typeof initialTracks;
  let tracksService: {
    findAll: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    tracks = initialTracks.map((track) => ({
      ...track,
      bpm: { ...track.bpm },
    }));

    tracksService = {
      findAll: jest.fn(() => Promise.resolve(tracks)),
      create: jest.fn((dto: CreateTrackDto) => {
        const created: Track = {
          id: Math.max(...tracks.map((track) => track.id)) + 1,
          ...dto,
        };

        tracks.push(created);
        return Promise.resolve(created);
      }),
      update: jest.fn((id: number, dto: UpdateTrackDto) => {
        const track = tracks.find((item) => item.id === id);

        if (!track) {
          return Promise.reject(new NotFoundException('Track not found'));
        }

        Object.assign(track, dto);
        return Promise.resolve(track);
      }),
      remove: jest.fn((id: number) => {
        const track = tracks.find((item) => item.id === id);

        if (!track) {
          return Promise.reject(new NotFoundException('Track not found'));
        }

        tracks = tracks.filter((item) => item.id !== id);
        return Promise.resolve();
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TracksController],
      providers: [
        {
          provide: TracksService,
          useValue: tracksService,
        },
      ],
    }).compile();

    controller = module.get<TracksController>(TracksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns tracks from service', async () => {
    await expect(controller.findAll()).resolves.toHaveLength(2);
  });

  it('creates a track using the dto', async () => {
    const dto = {
      title: 'Synth Bloom',
      releaseDate: '2026-01-01',
      description: 'Modular pads with driving groove',
      bpm: { bpmFrom: 130, bpmTo: 135 },
    };

    const created = await controller.create(dto);
    expect(created).toMatchObject(dto);
    expect(created.id).toBeGreaterThan(2);
  });

  it('updates an existing track', async () => {
    const updated = await controller.update(1, { title: 'Updated Controller' });
    expect(updated.title).toBe('Updated Controller');
  });

  it('throws NotFoundException when updating missing id', async () => {
    await expect(controller.update(99, { title: 'Missing' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('removes a track by id', async () => {
    await controller.remove(1);
    const allTracks = await controller.findAll();

    expect(allTracks.some((track) => track.id === 1)).toBe(false);
  });

  it('throws NotFoundException when deleting absent id', async () => {
    await expect(controller.remove(99)).rejects.toThrow(NotFoundException);
  });
});
