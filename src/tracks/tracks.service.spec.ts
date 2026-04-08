import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateTrackDto } from './create-track.dto';
import { UpdateTrackDto } from './update-track.dto';
import { TracksService } from './tracks.service';

describe('TracksService', () => {
  let service: TracksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TracksService],
    }).compile();

    service = module.get<TracksService>(TracksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll returns the initial tracks', () => {
    expect(service.findAll()).toHaveLength(2);
  });

  it('create adds a track with incremented id', () => {
    const dto: CreateTrackDto = {
      title: 'New Dawn',
      releaseDate: '2025-01-01',
      description: 'Uplifting psy with sharp leads',
      bpm: { bpmFrom: 132, bpmTo: 136 },
    };

    const created = service.create(dto);
    expect(created.id).toEqual(3);
    expect(created).toMatchObject(dto);
    expect(service.findAll()).toContainEqual(created);
  });

  describe('update', () => {
    it('changes updatable fields', () => {
      const dto: UpdateTrackDto = {
        title: 'Updated Title',
        bpm: { bpmFrom: 138, bpmTo: 142 },
      };
      const updated = service.update(1, dto);
      expect(updated.title).toBe(dto.title);
      expect(updated.bpm).toEqual(dto.bpm);
    });

    it('throws NotFoundException when id missing', () => {
      expect(() => service.update(99, { title: 'Nope' })).toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('removes the track from list', () => {
      service.remove(2);
      expect(service.findAll().some((track) => track.id === 2)).toBe(false);
    });

    it('throws NotFoundException for absent id', () => {
      expect(() => service.remove(99)).toThrow(NotFoundException);
    });
  });
});
