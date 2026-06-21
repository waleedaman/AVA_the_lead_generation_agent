import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ResearchJobsService } from './research-jobs.service';
import { ResearchJobsController } from './research-jobs.controller';
import { ResearchJob, ResearchJobSchema } from './schemas/research-job.schema';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { Campaign, CampaignSchema } from '../campaigns/schemas/campaign.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ResearchJob.name, schema: ResearchJobSchema },
      { name: Company.name, schema: CompanySchema },
      { name: Campaign.name, schema: CampaignSchema },
    ]),
  ],
  controllers: [ResearchJobsController],
  providers: [ResearchJobsService],
  exports: [ResearchJobsService],
})
export class ResearchJobsModule {}
