import type { Track } from '../tracks/tracks.interfaces';

export const tracks: Track[] = [
  {
    id: 1,
    ownerId: null,
    hasAudio: false,
    genre: null,
    subgenre: null,
    title: 'Psylogy',
    description: 'Driving psytrance riddled with analog synths',
    publicationDate: '2024-01-01',
    bpm: {
      bpmFrom: 135,
      bpmTo: 140,
    },
  },
  {
    id: 2,
    ownerId: null,
    hasAudio: false,
    genre: null,
    subgenre: null,
    title: 'Psytechnica',
    description: 'Rounded bass and modular textures for the dancefloor',
    publicationDate: '2024-06-14',
    bpm: {
      bpmFrom: 140,
      bpmTo: 145,
    },
  },
];
