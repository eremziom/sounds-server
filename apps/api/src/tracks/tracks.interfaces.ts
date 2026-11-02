import { BpmRangeDto } from './bpm-range.dto';
export interface Track {
  id: number;
  ownerId: number | null;
  author: string | null;
  hasAudio: boolean;
  title: string;
  description: string | null;
  genre: string | null;
  subgenre: string | null;
  publicationDate: string;
  bpm: BpmRangeDto | null;
}
