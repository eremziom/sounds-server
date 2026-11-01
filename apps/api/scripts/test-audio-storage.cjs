/* Smoke test for the compiled module/assets. Uses only a fresh temporary store. */
const assert = require('node:assert/strict');
const { mkdtemp, readFile, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');

async function main() {
  const directory = await mkdtemp(path.join(tmpdir(), 'sounds-audio-build-'));
  process.env.AUDIO_STORAGE_DIR = directory;
  process.env.AUDIO_MAX_FILE_BYTES = '52428800';
  let app;
  try {
    const { NestFactory } = require('@nestjs/core');
    const { AudioModule } = require('../dist/src/audio/audio.module.js');
    const {
      LocalAudioStorageService,
    } = require('../dist/src/audio/local-audio-storage.service.js');
    app = await NestFactory.createApplicationContext(AudioModule, {
      logger: false,
      abortOnError: false,
    });
    const storage = app.get(LocalAudioStorageService);
    const mp3 = await readFile(path.resolve('src/audio/fixtures/tone.mp3'));
    const temporary = await storage.writeTemporary(Readable.from([mp3]));
    const saved = await storage.commit(temporary.temporaryKey);
    assert.equal(saved.mimeType, 'audio/mpeg');
    assert.equal(saved.sizeBytes, mp3.length);
    const audio = await storage.openRead(saved.storageKey);
    assert.deepEqual(Buffer.concat(await audio.stream.toArray()), mp3);
    await storage.remove(saved.storageKey);
    const broken = await storage.writeTemporary(Readable.from(['fake mp3']));
    await assert.rejects(
      storage.commit(broken.temporaryKey),
      (error) => error.getResponse().code === 'AUDIO_FORMAT_UNSUPPORTED',
    );
    assert.deepEqual(await readdir(path.join(directory, 'tmp')), []);
    assert.deepEqual(await readdir(path.join(directory, 'files')), []);
    console.log(
      'Compiled audio module: startup, embedded WASM decoder, streamed save/read/delete and rejected-file cleanup passed. No FFmpeg required.',
    );
  } finally {
    if (app) await app.close();
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('Audio storage smoke test failed:', error.code ?? error.name);
  process.exitCode = 1;
});
