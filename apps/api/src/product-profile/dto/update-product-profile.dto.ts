import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateProductProfileDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  productPageUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  valueProposition?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  painPointsSolved?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  differentiators?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  proofPoints?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  complianceClaimsToAvoid?: string[];

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsOptional()
  @IsString()
  senderRole?: string;

  @IsOptional()
  @IsString()
  defaultCta?: string;
}
