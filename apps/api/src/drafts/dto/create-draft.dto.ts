import {
  IsArray,
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export type DraftStatus =
  | 'needs_review'
  | 'pending_review'
  | 'approved'
  | 'edited'
  | 'rejected'
  | 'exported'
  | 'sent';

export class CreateDraftDto {
  @IsMongoId()
  campaignId: string;

  @IsMongoId()
  companyId: string;

  @IsIn(['email', 'linkedin', 'generic'])
  channel: 'email' | 'linkedin' | 'generic';

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  selectedAngle?: string;

  @IsOptional()
  @IsString()
  reasoning?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourcesUsed?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  riskFlags?: string[];

  @IsOptional()
  @IsString()
  reviewerNotes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  qualityScore?: number;

  @IsOptional()
  @IsBoolean()
  qualityPassed?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  qualityFlags?: string[];

  @IsOptional()
  @IsIn([
    'needs_review',
    'pending_review',
    'approved',
    'edited',
    'rejected',
    'exported',
    'sent',
  ])
  status?: DraftStatus;

  @IsOptional()
  @IsObject()
  angle?: unknown;
}
