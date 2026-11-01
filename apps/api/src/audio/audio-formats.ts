// Formats supported by the built-in validator. Keep storage/UI MIME mapping here.
export const AUDIO_FORMATS = [
  { extension: '.mp3', mimeType: 'audio/mpeg' },
  { extension: '.wav', mimeType: 'audio/wav' },
] as const;

export function audioMimeType(extension: 'mp3' | 'wav') {
  return AUDIO_FORMATS[extension === 'mp3' ? 0 : 1].mimeType;
}
