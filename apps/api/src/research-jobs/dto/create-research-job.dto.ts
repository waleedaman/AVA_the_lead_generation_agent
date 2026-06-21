import {
  IsDateString,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';

export type ResearchJobStatus = 'queued' | 'running' | 'completed' | 'failed';
export type ResearchJobStep =
  | 'crawl'
  | 'linkedin'
  | 'enrich_sources'
  | 'extract_facts'
  | 'extract'
  | 'profile'
  | 'signals'
  | 'score'
  | 'contact_discovery'
  | 'oversight'
  | 'draft'
  | 'completed';

export class CreateResearchJobDto {
  @IsMongoId()
  campaignId: string;

  @IsMongoId()
  companyId: string;

  @IsOptional()
  @IsIn(['queued', 'running', 'completed', 'failed'])
  status?: ResearchJobStatus;

  @IsOptional()
  @IsIn([
    'crawl',
    'linkedin',
    'enrich_sources',
    'extract_facts',
    'extract',
    'profile',
    'signals',
    'score',
    'contact_discovery',
    'oversight',
    'draft',
    'completed',
  ])
  currentStep?: ResearchJobStep;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;
}
