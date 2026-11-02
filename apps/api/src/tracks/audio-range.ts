/** One byte range only; callers return 416 for invalid/unsatisfiable input. */
export function parseAudioRange(header: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  const length = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix === 0n) return null;
    return {
      start: Number(suffix >= length ? 0n : length - suffix),
      end: size - 1,
    };
  }
  const start = BigInt(match[1]);
  const end = match[2] ? BigInt(match[2]) : length - 1n;
  if (start >= length || end < start) return null;
  return {
    start: Number(start),
    end: Number(end >= length ? length - 1n : end),
  };
}
