import type { Track } from '../tracks/tracks.interfaces';

export const tracks: Track[] = [
  {
    id: 1,
    title: 'Psylogy',
    description: 'Driving psytrance riddled with analog synths',
    releaseDate: '2024-01-01',
    bpm: {
      bpmFrom: 135,
      bpmTo: 140,
    },
  },
  {
    id: 2,
    title: 'Psytechnica',
    description: 'Rounded bass and modular textures for the dancefloor',
    releaseDate: '2024-06-14',
    bpm: {
      bpmFrom: 140,
      bpmTo: 145,
    },
  },
];
