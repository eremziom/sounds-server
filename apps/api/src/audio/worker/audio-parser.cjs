const { open } = require('node:fs/promises');

class InvalidAudio extends Error {
  constructor(kind = 'invalid') {
    super(kind);
    this.kind = kind;
  }
}
const invalid = () => {
  throw new InvalidAudio();
};
const unsupported = () => {
  throw new InvalidAudio('unsupported');
};

// Random access with a fixed-size cache; never load the entire recording.
class Reader {
  constructor(handle, size) {
    this.handle = handle;
    this.size = size;
    this.buffer = Buffer.alloc(65536);
    this.start = -1;
    this.length = 0;
  }
  async at(position, length) {
    if (
      position < 0 ||
      length < 0 ||
      length > this.buffer.length ||
      position + length > this.size
    )
      invalid();
    if (position < this.start || position + length > this.start + this.length) {
      this.start = position;
      this.length = 0;
      const target = Math.min(this.buffer.length, this.size - position);
      while (this.length < target) {
        const { bytesRead } = await this.handle.read(
          this.buffer,
          this.length,
          target - this.length,
          position + this.length,
        );
        if (!bytesRead) invalid();
        this.length += bytesRead;
      }
    }
    return this.buffer.subarray(
      position - this.start,
      position - this.start + length,
    );
  }
}

async function validateWav(reader) {
  const header = await reader.at(0, 12);
  if (header.toString('ascii', 8, 12) !== 'WAVE') unsupported();
  if (header.readUInt32LE(4) + 8 !== reader.size) invalid();
  let format;
  let audio;
  for (let position = 12; position < reader.size; ) {
    const chunk = await reader.at(position, 8);
    const name = chunk.toString('ascii', 0, 4);
    const length = chunk.readUInt32LE(4);
    const start = position + 8;
    const end = start + length;
    if (end + (length % 2) > reader.size) invalid();
    if (name === 'fmt ') {
      if (format || audio || length < 16) invalid();
      const fmt = await reader.at(start, Math.min(length, 40));
      let encoding = fmt.readUInt16LE(0);
      const channels = fmt.readUInt16LE(2);
      const sampleRate = fmt.readUInt32LE(4);
      const byteRate = fmt.readUInt32LE(8);
      const blockAlign = fmt.readUInt16LE(12);
      const bits = fmt.readUInt16LE(14);
      if (length !== 16 && (length < 18 || 18 + fmt.readUInt16LE(16) > length))
        invalid();
      if (encoding === 0xfffe) {
        if (length < 40 || fmt.readUInt16LE(16) < 22) invalid();
        if (fmt.subarray(28, 40).toString('hex') !== '00001000800000aa00389b71')
          unsupported();
        encoding = fmt.readUInt32LE(24);
        const validBits = fmt.readUInt16LE(18);
        if (
          !validBits ||
          validBits > bits ||
          (encoding === 3 && validBits !== bits)
        )
          invalid();
      }
      if (![1, 3].includes(encoding)) unsupported();
      if (!(encoding === 1 ? [8, 16, 24, 32] : [32, 64]).includes(bits))
        unsupported();
      if (
        !channels ||
        !sampleRate ||
        blockAlign !== channels * (bits / 8) ||
        byteRate !== sampleRate * blockAlign
      )
        invalid();
      format = { encoding, blockAlign, bytesPerSample: bits / 8 };
    } else if (name === 'data') {
      if (!format || audio || !length || length % format.blockAlign) invalid();
      audio = { start, length };
    }
    position = end + (length % 2);
  }
  if (!format || !audio) invalid();
  // PCM integers are already decoded samples; every bit pattern is valid.
  // Read all samples, and reject NaN/Infinity in floating-point WAV.
  for (let offset = 0; offset < audio.length; ) {
    const length = Math.min(
      65536 - (65536 % format.bytesPerSample),
      audio.length - offset,
    );
    const data = await reader.at(audio.start + offset, length);
    if (format.encoding === 3) {
      for (let i = 0; i < length; i += format.bytesPerSample) {
        const sample =
          format.bytesPerSample === 4
            ? data.readFloatLE(i)
            : data.readDoubleLE(i);
        if (!Number.isFinite(sample)) invalid();
      }
    }
    offset += length;
  }
  return 'wav';
}

function mp3Header(header) {
  if (header[0] !== 0xff || (header[1] & 0xe0) !== 0xe0) invalid();
  const version = (header[1] >> 3) & 3;
  const layer = (header[1] >> 1) & 3;
  const bitrateIndex = header[2] >> 4;
  const rateIndex = (header[2] >> 2) & 3;
  if (
    version === 1 ||
    bitrateIndex === 15 ||
    rateIndex === 3 ||
    (header[3] & 3) === 2
  )
    invalid();
  if (layer !== 1) unsupported();
  if (bitrateIndex === 0) unsupported(); // Free-format MP3 is outside this version.
  const bitrates =
    version === 3
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const sampleRate =
    [44100, 48000, 32000][rateIndex] /
    (version === 3 ? 1 : version === 2 ? 2 : 4);
  const length =
    Math.floor(
      ((version === 3 ? 144000 : 72000) * bitrates[bitrateIndex]) / sampleRate,
    ) +
    ((header[2] >> 1) & 1);
  return {
    length,
    sampleRate,
    channels: header[3] >> 6 === 3 ? 1 : 2,
    mpeg1: version === 3,
    crcBytes: header[1] & 1 ? 0 : 2,
  };
}

// mpg123 can conceal damaged frames with silence. Validate Layer III side
// information as well, rather than treating returned samples as proof of validity.
function validateSideInfo(data, frame, reservoirBytes) {
  const sideLength = frame.mpeg1
    ? frame.channels === 1
      ? 17
      : 32
    : frame.channels === 1
      ? 9
      : 17;
  const offset = 4 + frame.crcBytes;
  const side = data.subarray(offset, offset + sideLength);
  if (side.length !== sideLength) invalid();
  let bit = 0;
  const take = (count) => {
    let result = 0;
    for (let i = 0; i < count; i++, bit++)
      result = result * 2 + ((side[bit >> 3] >> (7 - (bit & 7))) & 1);
    return result;
  };
  const mainDataBegin = take(frame.mpeg1 ? 9 : 8);
  if (mainDataBegin > reservoirBytes) invalid();
  take(
    frame.mpeg1 ? (frame.channels === 1 ? 5 : 3) : frame.channels === 1 ? 1 : 2,
  );
  if (frame.mpeg1) take(4 * frame.channels);
  let mainBits = 0;
  const table = () => {
    if ([4, 14].includes(take(5))) invalid();
  };
  for (let granule = 0; granule < (frame.mpeg1 ? 2 : 1); granule++) {
    for (let channel = 0; channel < frame.channels; channel++) {
      mainBits += take(12);
      if (take(9) > 288) invalid();
      take(8);
      take(frame.mpeg1 ? 4 : 9);
      if (take(1)) {
        if (take(2) === 0) invalid();
        take(1);
        table();
        table();
        take(9);
      } else {
        table();
        table();
        table();
        if (take(4) + take(3) > 20) invalid();
      }
      if (frame.mpeg1) take(1);
      take(2);
    }
  }
  const mainBytes = data.length - offset - sideLength;
  if (mainBits > (mainDataBegin + mainBytes) * 8) invalid();
  return Math.min(511, reservoirBytes + mainBytes);
}

async function validateMp3(reader) {
  let start = 0;
  let end = reader.size;
  const first = await reader.at(0, Math.min(10, reader.size));
  if (first.toString('ascii', 0, 3) === 'ID3') {
    if (
      first.length < 10 ||
      ![2, 3, 4].includes(first[3]) ||
      first[4] === 0xff ||
      first.subarray(6, 10).some((byte) => byte & 0x80)
    )
      invalid();
    const version = first[3];
    if ((first[5] & (version === 2 ? 0x3f : version === 3 ? 0x1f : 0x0f)) !== 0)
      invalid();
    const size = first
      .subarray(6, 10)
      .reduce((value, byte) => value * 128 + byte, 0);
    start = 10 + size;
    if (version === 4 && first[5] & 0x10) {
      const expected = Buffer.from(first);
      expected.write('3DI', 0, 'ascii');
      if (!(await reader.at(start, 10)).equals(expected)) invalid();
      start += 10;
    }
    if (start >= end) invalid();
  }
  if (end >= 128 && (await reader.at(end - 128, 3)).toString('ascii') === 'TAG')
    end -= 128;
  if (end - start < 4) invalid();
  const signature = await reader.at(start, 4);
  if (signature[0] !== 0xff || (signature[1] & 0xe0) !== 0xe0) {
    if (start) invalid();
    unsupported();
  }
  const { MPEGDecoder } = await import('mpg123-decoder');
  const decoder = new MPEGDecoder({ enableGapless: false });
  try {
    await decoder.ready;
    let frames = 0;
    let samples = 0;
    let initial;
    let reservoirBytes = 0;
    for (let position = start; position < end; ) {
      const frame = mp3Header(await reader.at(position, 4));
      if (position + frame.length > end) invalid();
      if (
        initial &&
        (initial.sampleRate !== frame.sampleRate ||
          initial.channels !== frame.channels)
      )
        invalid();
      initial ??= frame;
      const data = await reader.at(position, frame.length);
      reservoirBytes = validateSideInfo(data, frame, reservoirBytes);
      const decoded = decoder.decodeFrame(data);
      if (decoded.errors.length) invalid();
      samples += decoded.samplesDecoded;
      frames++;
      position += frame.length;
    }
    if (frames < 2 || !samples) invalid();
    return 'mp3';
  } finally {
    decoder.free();
  }
}

async function validateFile(path, maxFileBytes) {
  const handle = await open(path, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || !info.size) invalid();
    if (info.size > maxFileBytes) throw new InvalidAudio('tooLarge');
    const reader = new Reader(handle, info.size);
    const signature = await reader.at(0, Math.min(4, info.size));
    return signature.toString('ascii') === 'RIFF'
      ? await validateWav(reader)
      : await validateMp3(reader);
  } finally {
    await handle.close();
  }
}

module.exports = { validateFile, InvalidAudio };
