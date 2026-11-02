const { cleanupAudio } = require('../dist/src/audio/audio-cleanup.js');
const { readAudioConfig } = require('../dist/src/audio/audio-config.js');
const { PrismaService } = require('../dist/src/prisma/prisma.service.js');
require('dotenv').config({ quiet: true });

async function main() {
  const args = process.argv.slice(2);
  let remove = false,
    graceHours = 24;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') {
      console.log(
        'cleanup:audio [--delete] [--grace-hours HOURS]\nDefault: read-only preview. HOURS must be an integer >= 24. Uses API DATABASE_URL and AUDIO_STORAGE_DIR.',
      );
      return;
    }
    if (args[i] === '--delete' && !remove) remove = true;
    else if (
      args[i] === '--grace-hours' &&
      /^[1-9]\d*$/.test(args[i + 1] ?? '')
    )
      graceHours = Number(args[++i]);
    else throw new Error('Invalid arguments; use --help');
  }
  if (!Number.isSafeInteger(graceHours) || graceHours < 24)
    throw new Error('Grace period must be an integer >= 24 hours');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const { directory } = readAudioConfig({ get: (key) => process.env[key] });
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const summary = await cleanupAudio(prisma, directory, {
      delete: remove,
      graceHours,
      report: (event) => console.log(JSON.stringify(event)),
    });
    console.log(JSON.stringify({ summary }));
    if (summary.errors) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  // Never print connection strings, credentials or raw DB/filesystem errors.
  console.error(
    'Audio cleanup failed. Check arguments, API configuration, database and private storage access.',
  );
  process.exitCode = 1;
});
