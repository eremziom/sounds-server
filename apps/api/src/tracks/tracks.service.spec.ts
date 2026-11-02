import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { CreateTrackDto } from './create-track.dto';
import { UpdateTrackDto } from './update-track.dto';
import { TracksService } from './tracks.service';
import { PrismaService } from '../prisma/prisma.service';
import { LocalAudioStorageService } from '../audio/local-audio-storage.service';

type DbTrack = (typeof initialTracks)[number];
type TrackWhereUnique = { where: { id: number } };
type TrackCreateArgs = {
  data: Omit<DbTrack, 'id' | 'audioFile' | 'owner'>;
};
type TrackUpdateArgs = TrackWhereUnique & {
  data: Partial<DbTrack>;
};

const initialTracks = [
  {
    id: 1,
    ownerId: null as number | null,
    owner: null as { username: string } | null,
    audioFile: null as { id: number } | null,
    title: 'Solar Drift',
    publicationDate: new Date('2024-01-01'),
    description: 'Driving psy with warm bass',
    bpmFrom: 128,
    bpmTo: 132,
  },
  {
    id: 2,
    ownerId: 42,
    owner: { username: 'night-artist' },
    audioFile: { id: 10 },
    title: 'Night Pulse',
    publicationDate: new Date('2024-02-01'),
    description: 'Dark rolling groove',
    bpmFrom: 134,
    bpmTo: 138,
  },
];

describe('TracksService', () => {
  let service: TracksService;
  let prisma: {
    $transaction: jest.Mock;
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
      $transaction: jest.fn(
        (callback: (tx: { track: typeof prisma.track }) => unknown) =>
          callback(prisma),
      ),
      track: {
        findMany: jest.fn(() =>
          Promise.resolve([...tracks].sort((a, b) => a.id - b.id)),
        ),
        findUnique: jest.fn(({ where: { id } }: TrackWhereUnique) =>
          Promise.resolve(tracks.find((track) => track.id === id) ?? null),
        ),
        create: jest.fn(({ data }: TrackCreateArgs) => {
          const newTrack = {
            id: Math.max(...tracks.map((track) => track.id)) + 1,
            audioFile: null,
            owner: data.ownerId === 42 ? { username: 'night-artist' } : null,
            ...data,
          };

          tracks.push(newTrack);
          return Promise.resolve(newTrack);
        }),
        update: jest.fn(({ where: { id }, data }: TrackUpdateArgs) => {
          const trackIndex = tracks.findIndex((track) => track.id === id);
          tracks[trackIndex] = {
            ...tracks[trackIndex],
            ...data,
          };

          return Promise.resolve(tracks[trackIndex]);
        }),
        delete: jest.fn(({ where: { id } }: TrackWhereUnique) => {
          tracks = tracks.filter((track) => track.id !== id);
          return Promise.resolve();
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TracksService,
        { provide: LocalAudioStorageService, useValue: { remove: jest.fn() } },
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

  it('returns historical tracks without an owner or audio', async () => {
    await expect(service.findOne(1)).resolves.toMatchObject({
      id: 1,
      ownerId: null,
      author: null,
      hasAudio: false,
      title: 'Solar Drift',
      publicationDate: '2024-01-01',
    });
  });

  it('reports audio availability without exposing the storage relation', async () => {
    const track = await service.findOne(2);
    expect(track).toMatchObject({
      ownerId: 42,
      author: 'night-artist',
      hasAudio: true,
    });
    expect(prisma.track.findUnique).toHaveBeenCalledWith({
      where: { id: 2 },
      include: {
        audioFile: { select: { id: true } },
        owner: { select: { username: true } },
      },
    });
    expect(track).not.toHaveProperty('owner');
    expect(track).not.toHaveProperty('audioFile');
    expect(await service.findAll()).toContainEqual(track);
    const updated = await service.update(2, { title: 'Renamed' });
    expect(updated).toMatchObject({ ownerId: 42, hasAudio: true });
  });

  it('create adds a track with incremented id', async () => {
    const dto: CreateTrackDto = {
      title: 'New Dawn',
      publicationDate: '2026-11-01',
      description: 'Uplifting psy with sharp leads',
      bpm: { bpmFrom: 132, bpmTo: 136 },
    };

    const created = await service.create(dto, 42);
    expect(created.id).toEqual(3);
    expect(created).toMatchObject(dto);
    expect(created).toMatchObject({ ownerId: 42, hasAudio: false });
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
      await service.remove(2, {
        userId: 42,
        permissions: ['tracks:delete-any'],
      });
      const allTracks = await service.findAll();

      expect(allTracks.some((track) => track.id === 2)).toBe(false);
    });

    it('throws NotFoundException for absent id', async () => {
      await expect(
        service.remove(99, { userId: 42, permissions: ['tracks:delete-any'] }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
