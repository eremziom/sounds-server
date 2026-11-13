import { validateTool } from './tool-registry';
describe('registered artwork tools', () => {
  it('accepts the measured generation profile', () => {
    expect(
      validateTool(
        'generateImage',
        { prompt: 'A scene', seed: 5, width: 1024, height: 576 },
        [],
      ).gpu,
    ).toBe('klein');
  });
  it('rejects commands, unknown tools and unmeasured dimensions', () => {
    expect(() => validateTool('exec', { command: 'test' }, [])).toThrow();
    expect(() =>
      validateTool(
        'generateImage',
        { prompt: 'scene', seed: 1, width: 768, height: 432 },
        [],
      ),
    ).toThrow();
    expect(() =>
      validateTool('fillBackground', { dilation: 2, path: '../secret' }, [
        'a',
        'b',
      ]),
    ).toThrow();
  });
  it('validates inputs, finite parameters and path timing data', () => {
    expect(() =>
      validateTool(
        'refineMask',
        { operation: 'feather', radius: NaN, role: 'material-mask' },
        ['a', 'b'],
      ),
    ).toThrow();
    expect(() =>
      validateTool('buildDelayMap', { direction: 'path' }, ['a', 'b']),
    ).toThrow();
    expect(() => validateTool('extractLayer', {}, ['a', 'a'])).toThrow();
    expect(() =>
      validateTool(
        'buildDelayMap',
        {
          direction: 'path',
          path: [
            { x: 0, y: 0 },
            { x: 16, y: 9 },
          ],
        },
        ['a', 'b'],
      ),
    ).not.toThrow();
  });
});
