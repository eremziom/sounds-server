import type {
  ArtworkJobRequest,
  ArtworkToolName,
} from '../../../artwork-contracts';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsObject,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
export class CreateArtworkJobDto implements ArtworkJobRequest {
  @IsUUID('4') baseRevisionId: string;
  @IsString() @Length(1, 100) requestKey: string;
  @IsString() @Length(1, 100) tool: ArtworkToolName;
  @IsObject() arguments: Record<string, unknown>;
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  inputIds: string[];
}
