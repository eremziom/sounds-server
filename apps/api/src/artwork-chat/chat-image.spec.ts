import sharp from 'sharp';
import { renderChatPoint } from './chat-image';

describe('renderChatPoint', () => {
  it('marks the selected pixel without covering it, including a crop at the edge', async () => {
    const source = await sharp({
      create: { width: 320, height: 260, channels: 3, background: '#145078' },
    })
      .png()
      .toBuffer();
    const crop = await renderChatPoint(source, 320, 260, { x: 301, y: 250 });
    const { data, info } = await sharp(crop)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      return Array.from(data.subarray(offset, offset + info.channels));
    };
    expect([info.width, info.height]).toEqual([224, 224]);
    expect(pixel(205, 214)).toEqual([20, 80, 120]);
    const [red, green, blue] = pixel(215, 214);
    expect(red).toBeGreaterThan(200);
    expect(green).toBeLessThan(90);
    expect(blue).toBeLessThan(90);
  });
});
