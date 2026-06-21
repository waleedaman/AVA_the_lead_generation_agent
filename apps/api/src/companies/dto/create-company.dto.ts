import { IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCompanyDto {
  @IsMongoId()
  campaignId: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsString()
  linkedinUrl?: string;

  @IsOptional()
  @IsString()
  linkedinOrganizationId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
