import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export type CampaignTone = 'technical' | 'friendly' | 'formal' | 'concise';
export type CampaignChannel = 'email' | 'linkedin' | 'generic';

export class CreateCampaignDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetIndustries?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  regions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  exclusionKeywords?: string[];

  @IsOptional()
  @IsObject()
  industryProfile?: {
    targetCompanyTypes?: string[];
    buyingSignals?: string[];
    negativeSignals?: string[];
    targetRoles?: string[];
    regions?: string[];
    scoringWeights?: Record<string, number>;
    minimumScoreForContacts?: number;
    minimumScoreForOversight?: number;
    minimumScoreForDraft?: number;
    discoverySources?: string[];
  };

  @IsOptional()
  @IsString()
  offer?: string;

  @IsOptional()
  @IsString()
  cta?: string;

  @IsOptional()
  @IsIn(['technical', 'friendly', 'formal', 'concise'])
  tone?: CampaignTone;

  @IsOptional()
  @IsIn(['email', 'linkedin', 'generic'])
  channel?: CampaignChannel;

  @IsOptional()
  @IsBoolean()
  approvalRequired?: boolean;

  @IsOptional()
  @IsString()
  createdBy?: string;
}
