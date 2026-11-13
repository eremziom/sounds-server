import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  ArtworkBrief,
  ArtworkLayerDraft,
  ArtworkRevisionSnapshot,
} from '../../../artwork-contracts';

export class CreateProjectDto {
  @IsString() @Length(1, 160) title: string;
}

export class ArtworkPageDto {
  @IsOptional() @IsUUID('4') cursor?: string;
}

export class BriefDto implements ArtworkBrief {
  @IsString() @Length(1, 16000) intent: string;
  @IsString() @Length(1, 100) guidelinesVersion: string;
  @IsString() @Length(1, 500) guidelinesPath: string;
  @IsString() @Length(1, 16000) composition: string;
  @IsString() @Length(1, 16000) motionPlan: string;
  @IsString() @Length(1, 16000) lightingPlan: string;
  @IsString() @Length(1, 16000) blackoutPlan: string;
  @IsString() @Length(1, 16000) qaPlan: string;
}

export class LayerDraftDto implements ArtworkLayerDraft {
  @IsString() @Length(1, 100) id: string;
  @IsUUID('4') imageArtifactId: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  maskArtifactIds: string[];
  @IsObject() parameters: Record<string, unknown>;
}

export class RevisionSnapshotDto implements ArtworkRevisionSnapshot {
  @IsInt() @Min(1) @Max(1) schemaVersion: 1;
  @IsDefined() @ValidateNested() @Type(() => BriefDto) brief: BriefDto;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LayerDraftDto)
  layers: LayerDraftDto[];
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  artifactIds: string[];
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) decisions: string[];
}

export class CreateRevisionDto {
  @IsOptional() @IsUUID('4') baseRevisionId?: string;
  @IsDefined()
  @ValidateNested()
  @Type(() => RevisionSnapshotDto)
  snapshot: RevisionSnapshotDto;
}

export class RestoreRevisionDto {
  @IsUUID('4') baseRevisionId: string;
  @IsUUID('4') revisionId: string;
}

export class ArtifactMetadataDto {
  @IsIn([
    'image',
    'visibility-mask',
    'occlusion-mask',
    'material-mask',
    'influence-map',
    'delay-map',
    'depth',
    'flow',
    'report',
  ])
  kind: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  inputIds: string[];
  @IsOptional() @IsInt() @Min(1) @Max(16384) width?: number;
  @IsOptional() @IsInt() @Min(1) @Max(16384) height?: number;
  @IsOptional() @IsUUID('4') registrationId?: string;
  @IsObject() provenance: Record<string, unknown>;
}

export class CreateMessageDto {
  @IsString() @Length(1, 16000) text: string;
}
