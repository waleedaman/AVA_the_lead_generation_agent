import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional } from 'class-validator';
import { CreateCompanyDto } from './create-company.dto';

export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {
  @IsOptional()
  @IsIn([
    'missing_info',
    'pending',
    'imported',
    'research_pending',
    'researching',
    'researched',
    'draft_ready',
    'approved',
    'rejected',
    'failed',
  ])
  status?: string;
}
