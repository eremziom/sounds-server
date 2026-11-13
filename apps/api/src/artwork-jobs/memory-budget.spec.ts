import { admitMemory } from './memory-budget';
const GiB = 2 ** 30;
const sample = {
  ramAvailableBytes: 16 * GiB,
  commitAvailableBytes: 12 * GiB,
  vramAvailableBytes: 12 * GiB,
  adapter: 'AMD Radeon RX 7800 XT',
  adapterKey: 'luid_0x0_0x1',
};
describe('memory admission', () => {
  it('requires commit headroom even when RAM/VRAM are available', () => {
    expect(admitMemory('klein', sample)).toBe(true);
    expect(
      admitMemory('klein', { ...sample, commitAvailableBytes: 3 * GiB }),
    ).toBe(false);
  });
  it('rejects unknown counters, wrong adapters and exhausted RAM', () => {
    expect(admitMemory('sam', { ...sample, vramAvailableBytes: NaN })).toBe(
      false,
    );
    expect(admitMemory('sam', { ...sample, adapter: 'integrated GPU' })).toBe(
      false,
    );
    expect(admitMemory('cpu', { ...sample, ramAvailableBytes: 100 })).toBe(
      false,
    );
  });
  it('admits a smaller measured-model profile without allowing Klein', () => {
    const low = { ...sample, commitAvailableBytes: 3 * GiB };
    expect(admitMemory('sam', low)).toBe(true);
    expect(admitMemory('cpu', low)).toBe(true);
    expect(admitMemory('klein', low)).toBe(false);
  });
  it('reserves additional working memory for large pixel arrays', () => {
    expect(
      admitMemory(
        'cpu',
        {
          ...sample,
          ramAvailableBytes: 2 * GiB,
          commitAvailableBytes: 2 * GiB,
        },
        8192 * 4608,
      ),
    ).toBe(false);
  });
});
