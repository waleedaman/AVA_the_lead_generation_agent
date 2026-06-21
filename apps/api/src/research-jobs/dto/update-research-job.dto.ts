import { PartialType } from '@nestjs/mapped-types';
import { CreateResearchJobDto } from './create-research-job.dto';

export class UpdateResearchJobDto extends PartialType(CreateResearchJobDto) {}
