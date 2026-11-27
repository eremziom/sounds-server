import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { CreatorChatRequest } from '../../../artwork-contracts';

class ChatPointDto {
  @IsInt() @Min(0) @Max(16384) x: number;
  @IsInt() @Min(0) @Max(16384) y: number;
}
export class CreatorChatDto implements CreatorChatRequest {
  @IsUUID('4') requestId: string;
  @IsOptional() @IsUUID('4') baseRevisionId: string | null;
  @IsString() @Length(1, 4000) text: string;
  @IsIn(['discuss', 'plan']) mode: 'discuss' | 'plan';
  @IsOptional() @IsUUID('4') imageArtifactId?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => ChatPointDto)
  point?: ChatPointDto;
}
