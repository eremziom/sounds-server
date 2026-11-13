import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from '../prisma/prisma.service';
import { ArtworkStorageService } from '../artworks/artwork-storage.service';
import { ArtworkJobRunner } from './artwork-job-runner';
async function main() {
  const config = new ConfigService(process.env),
    db = new PrismaService();
  const runner = new ArtworkJobRunner(
    db,
    new ArtworkStorageService(config),
    config,
  );
  let stopped = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => {
      stopped = true;
      runner.stop();
    });
  await db.$connect();
  try {
    do {
      await runner.tick();
      if (process.argv.includes('--once')) break;
      if (!stopped) await delay(5000);
    } while (!stopped);
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Artwork worker failed; no audio controls were called. Check local configuration and database.',
  );
  process.exitCode = 1;
});
