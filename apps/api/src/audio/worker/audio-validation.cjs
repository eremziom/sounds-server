const { parentPort, workerData } = require('node:worker_threads');
const { validateFile, InvalidAudio } = require('./audio-parser.cjs');

async function run() {
  if (!workerData.selfTest)
    return validateFile(workerData.path, workerData.maxFileBytes);
  const { MPEGDecoder } = await import('mpg123-decoder');
  const decoder = new MPEGDecoder();
  try {
    await decoder.ready;
  } finally {
    decoder.free();
  }
  return 'mp3';
}

run().then(
  (extension) => parentPort.postMessage({ extension }),
  (error) =>
    parentPort.postMessage({
      error:
        error instanceof InvalidAudio
          ? error.kind
          : ['ENOENT', 'EACCES', 'EIO', 'EPERM'].includes(error.code)
            ? 'storage'
            : 'validationUnavailable',
    }),
);
