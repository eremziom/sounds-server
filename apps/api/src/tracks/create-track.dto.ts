import {
  IsString,
  Length,
  ValidateNested,
  IsOptional,
  IsDateString,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BpmRangeDto } from './bpm-range.dto';
import { IsBpmRangeValid } from './validators/is-bpm-range-valid';

export class CreateTrackDto {
  @IsString({ message: 'Title must be a string' })
  @Length(3, 50, { message: 'Title must be between 3 and 50 characters' })
  title!: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  publicationDate!: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @Length(3, 300, {
    message: 'Description must be between 3 and 300 characters',
  })
  description?: string;

  @IsOptional()
  @IsString()
  @Length(3, 30)
  genre?: string;

  @IsOptional()
  @IsString()
  @Length(3, 30)
  subgenre?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BpmRangeDto)
  @IsBpmRangeValid({ message: 'bpmFrom must be <= bpmTo' })
  bpm?: BpmRangeDto;
}
