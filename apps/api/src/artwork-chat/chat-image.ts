import sharp from 'sharp';

export async function renderChatPoint(
  source: Buffer,
  width: number,
  height: number,
  point: { x: number; y: number },
) {
  const size = 224;
  const cropWidth = Math.min(size, width);
  const cropHeight = Math.min(size, height);
  const left = Math.min(width - cropWidth, Math.max(0, point.x - size / 2));
  const top = Math.min(height - cropHeight, Math.max(0, point.y - size / 2));
  const x = point.x - left + 0.5;
  const y = point.y - top + 0.5;
  const marker = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cropWidth}" height="${cropHeight}">
      <defs><g id="target" fill="none">
        <circle cx="${x}" cy="${y}" r="10"/>
        <path d="M${x - 17} ${y}h5m24 0h5 M${x} ${y - 17}v5m0 24v5"/>
      </g></defs>
      <use href="#target" stroke="#000" stroke-width="5"/>
      <use href="#target" stroke="#ff3636" stroke-width="3"/>
    </svg>`,
  );
  return sharp(source, { limitInputPixels: 67_108_864 })
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .composite([{ input: marker, gravity: 'northwest' }])
    .png()
    .toBuffer();
}
