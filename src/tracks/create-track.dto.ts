import {
  IsString,
  Length,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BpmRangeDto } from './bpm-range.dto';
import { IsBpmRangeValid } from './validators/is-bpm-range-valid';

export class CreateTrackDto {
  @IsString({ message: 'Title must be a string' })
  @Length(3, 50, { message: 'Title must be between 3 and 50 characters' })
  title!: string;

  @IsDateString({}, { message: 'Release date must be a valid date string' })
  releaseDate!: string;

  @IsString({ message: 'Genre must be a string' })
  @Length(3, 300, { message: 'Genre must be between 3 and 300 characters' })
  description!: string;

  @ValidateNested()
  @Type(() => BpmRangeDto)
  @IsBpmRangeValid({ message: 'bpmFrom must be <= bpmTo' })
  bpm!: BpmRangeDto;
}
