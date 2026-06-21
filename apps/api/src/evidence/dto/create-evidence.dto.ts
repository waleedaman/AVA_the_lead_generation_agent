import {
  IsArray,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

const evidenceSourceTypes = [
  'website_homepage',
  'website_about',
  'website_services',
  'website_product',
  'website_blog',
  'website_news',
  'website_careers',
  'website_jobs',
  'website_case_study',
  'website_event',
  'website_directory',
  'website_contact',
  'website_impressum',
  'linkedin_company_post',
  'linkedin_company_profile',
  'search_result',
  'job_posting',
  'conference_page',
  'association_member_page',
  'unknown_page',
] as const;

const retrievalStatuses = [
  'completed',
  'partial',
  'failed',
  'skipped',
  'disabled',
  'metadata_only',
] as const;

export class CreateEvidenceDto {
  @IsMongoId()
  campaignId: string;

  @IsMongoId()
  companyId: string;

  @IsIn(evidenceSourceTypes)
  sourceType: string;

  @IsUrl({ require_tld: false })
  url: string;

  @IsOptional()
  @IsString()
  pageTitle?: string;

  @IsOptional()
  @IsString()
  rawText?: string;

  @IsOptional()
  @IsString()
  cleanedText?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  detectedKeywords?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  detectedSignals?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsString()
  contentHash?: string;

  @IsOptional()
  @IsString()
  normalizedUrl?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  providerQuery?: string;

  @IsOptional()
  @IsObject()
  providerStatus?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  sourceRank?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  sourceConfidence?: number;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsIn(retrievalStatuses)
  retrievalStatus?: string;

  @IsOptional()
  @IsString()
  researchRunId?: string;

  @IsOptional()
  @IsDateString()
  retrievedAt?: string;
}
