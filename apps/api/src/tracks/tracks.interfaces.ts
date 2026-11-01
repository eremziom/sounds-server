import { BpmRangeDto } from './bpm-range.dto';
export interface Track {
  id: number;
  ownerId: number | null;
  hasAudio: boolean;
  title: string;
  description: string | null;
  releaseDate: string;
  bpm: BpmRangeDto;
}
