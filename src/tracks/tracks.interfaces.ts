import { BpmRangeDto } from './bpm-range.dto';
export interface Track {
  id: number;
  title: string;
  description: string;
  releaseDate: string;
  bpm: BpmRangeDto;
}