import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRevisionDto } from './artwork.dto';

describe('revision request contract', () => {
  const check = (value: unknown) =>
    validate(plainToInstance(CreateRevisionDto, value), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  it('requires the snapshot and brief', async () => {
    expect(await check({})).not.toHaveLength(0);
    expect(
      await check({
        snapshot: {
          schemaVersion: 1,
          layers: [],
          decisions: [],
          artifactIds: [],
        },
      }),
    ).not.toHaveLength(0);
  });
  it('rejects client-supplied ownership and runtime manifests', async () => {
    expect(
      await check({ ownerId: 12, snapshot: { manifest: {} } }),
    ).not.toHaveLength(0);
  });
});
