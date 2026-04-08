import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TracksController } from './tracks.controller';
import { TracksModule } from './tracks.module';

describe('TracksController', () => {
  let controller: TracksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [TracksModule],
    }).compile();

    controller = module.get<TracksController>(TracksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns tracks from service', () => {
    expect(controller.findAll()).toHaveLength(2);
  });

  it('creates a track using the dto', () => {
    const dto = {
      title: 'Synth Bloom',
      releaseDate: '2026-01-01',
      description: 'Modular pads with driving groove',
      bpm: { bpmFrom: 130, bpmTo: 135 },
    };

    const created = controller.create(dto);
    expect(created).toMatchObject(dto);
    expect(created.id).toBeGreaterThan(2);
  });

  it('updates an existing track', () => {
    const updated = controller.update(1, { title: 'Updated Controller' });
    expect(updated.title).toBe('Updated Controller');
  });

  it('throws NotFoundException when updating missing id', () => {
    expect(() => controller.update(99, { title: 'Missing' })).toThrow(
      NotFoundException,
    );
  });

  it('removes a track by id', () => {
    controller.remove(1);
    expect(controller.findAll().some((track) => track.id === 1)).toBe(false);
  });

  it('throws NotFoundException when deleting absent id', () => {
    expect(() => controller.remove(99)).toThrow(NotFoundException);
  });
});
