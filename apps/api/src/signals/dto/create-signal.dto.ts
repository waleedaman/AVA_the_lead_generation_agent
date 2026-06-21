import {
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateSignalDto {
  @IsMongoId()
  campaignId: string;

  @IsMongoId()
  companyId: string;

  @IsOptional()
  @IsMongoId()
  evidenceId?: string;

  @IsString()
  signalType: string;

  @IsOptional()
  @IsString()
  signalKey?: string;

  @IsOptional()
  @IsString()
  factType?: string;

  @IsOptional()
  @IsString()
  fact?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  relevanceScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsString()
  evidenceSnippet?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  researchRunId?: string;

  @IsOptional()
  @IsString()
  extractionModel?: string;
}
