export interface MemorySample {
  ramAvailableBytes: number;
  commitAvailableBytes: number;
  vramAvailableBytes: number;
  adapter: string;
  adapterKey: string;
}
const GiB = 2 ** 30;
export function admitMemory(
  profile: 'klein' | 'sam' | 'cpu',
  sample: MemorySample,
  sourcePixels = 0,
) {
  const required =
    profile === 'klein'
      ? { ram: 12, commit: 10, vram: 10.5 }
      : profile === 'sam'
        ? { ram: 2, commit: 2, vram: 1 }
        : { ram: 1, commit: 1, vram: 0 };
  const measured = [
    sample.ramAvailableBytes,
    sample.commitAvailableBytes,
    sample.vramAvailableBytes,
  ];
  if (
    measured.some((v) => !Number.isSafeInteger(v) || v < 0) ||
    !Number.isSafeInteger(sourcePixels) ||
    sourcePixels < 0 ||
    sourcePixels > 67108864 ||
    !sample.adapter?.includes('7800 XT') ||
    !sample.adapterKey?.startsWith('luid_')
  )
    return false;
  return (
    sample.ramAvailableBytes >=
      Math.max(required.ram * GiB, 0.5 * GiB + sourcePixels * 96) &&
    sample.commitAvailableBytes >=
      Math.max(required.commit * GiB, 0.5 * GiB + sourcePixels * 96) &&
    sample.vramAvailableBytes >= required.vram * GiB
  );
}
