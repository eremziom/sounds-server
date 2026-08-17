import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { CreateTrackDto } from './create-track.dto';
import { UpdateTrackDto } from './update-track.dto';
import { TracksService } from './tracks.service';
import { PrismaService } from '../prisma/prisma.service';

const initialTracks = [
  {
    id: 1,
    title: 'Solar Drift',
    releaseDate: new Date('2024-01-01'),
    description: 'Driving psy with warm bass',
    bpmFrom: 128,
    bpmTo: 132,
  },
  {
    id: 2,
    title: 'Night Pulse',
    releaseDate: new Date('2024-02-01'),
    description: 'Dark rolling groove',
    bpmFrom: 134,
    bpmTo: 138,
  },
];

describe('TracksService', () => {
  let service: TracksService;
  let prisma: {
    track: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let tracks: typeof initialTracks;

  beforeEach(async () => {
    tracks = initialTracks.map((track) => ({ ...track }));

    prisma = {
      track: {
        findMany: jest.fn(async () => [...tracks].sort((a, b) => a.id - b.id)),
        findUnique: jest.fn(async ({ where: { id } }) =>
          tracks.find((track) => track.id === id) ?? null,
        ),
        create: jest.fn(async ({ data }) => {
          const newTrack = {
            id: Math.max(...tracks.map((track) => track.id)) + 1,
            ...data,
          };

          tracks.push(newTrack);
          return newTrack;
        }),
        update: jest.fn(async ({ where: { id }, data }) => {
          const trackIndex = tracks.findIndex((track) => track.id === id);
          tracks[trackIndex] = {
            ...tracks[trackIndex],
            ...data,
          };

          return tracks[trackIndex];
        }),
        delete: jest.fn(async ({ where: { id } }) => {
          tracks = tracks.filter((track) => track.id !== id);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TracksService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<TracksService>(TracksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll returns the initial tracks', async () => {
    await expect(service.findAll()).resolves.toHaveLength(2);
  });

  it('create adds a track with incremented id', async () => {
    const dto: CreateTrackDto = {
      title: 'New Dawn',
      releaseDate: '2025-01-01',
      description: 'Uplifting psy with sharp leads',
      bpm: { bpmFrom: 132, bpmTo: 136 },
    };

    const created = await service.create(dto);
    expect(created.id).toEqual(3);
    expect(created).toMatchObject(dto);
    await expect(service.findAll()).resolves.toContainEqual(created);
  });

  describe('update', () => {
    it('changes updatable fields', async () => {
      const dto: UpdateTrackDto = {
        title: 'Updated Title',
        bpm: { bpmFrom: 138, bpmTo: 142 },
      };
      const updated = await service.update(1, dto);
      expect(updated.title).toBe(dto.title);
      expect(updated.bpm).toEqual(dto.bpm);
    });

    it('throws NotFoundException when id missing', async () => {
      await expect(service.update(99, { title: 'Nope' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('removes the track from list', async () => {
      await service.remove(2);
      const allTracks = await service.findAll();

      expect(allTracks.some((track) => track.id === 2)).toBe(false);
    });

    it('throws NotFoundException for absent id', async () => {
      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });
  });
});
