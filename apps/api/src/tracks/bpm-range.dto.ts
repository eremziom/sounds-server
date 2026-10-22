import { IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class BpmRangeDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'bpmFrom must be a number' })
  @Min(60)
  @Max(200)
  bpmFrom!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'bpmTo must be a number' })
  @Min(60)
  @Max(200)
  bpmTo!: number;
}
