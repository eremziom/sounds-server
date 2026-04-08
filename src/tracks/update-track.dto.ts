import { IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BpmRangeDto } from './bpm-range.dto';
import { IsBpmRangeValid } from './validators/is-bpm-range-valid';

export class UpdateTrackDto {
  @IsOptional()
  @IsString({ message: 'Title must be a string' })
  @Length(3, 50, { message: 'Title must be between 3 and 50 characters' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @Length(3, 300, {
    message: 'Description must be between 3 and 300 characters',
  })
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BpmRangeDto)
  @IsBpmRangeValid({ message: 'bpmFrom must be <= bpmTo' })
  bpm?: BpmRangeDto;
}
