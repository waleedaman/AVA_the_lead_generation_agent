import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { Campaign, CampaignSchema } from './schemas/campaign.schema';
import { ResearchJobsModule } from '../research-jobs/research-jobs.module';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { Evidence, EvidenceSchema } from '../evidence/schemas/evidence.schema';
import { Signal, SignalSchema } from '../signals/schemas/signal.schema';
import { Draft, DraftSchema } from '../drafts/schemas/draft.schema';
import { Contact, ContactSchema } from '../contacts/schemas/contact.schema';
import {
  ResearchJob,
  ResearchJobSchema,
} from '../research-jobs/schemas/research-job.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: Company.name, schema: CompanySchema },
      { name: Evidence.name, schema: EvidenceSchema },
      { name: Signal.name, schema: SignalSchema },
      { name: Draft.name, schema: DraftSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: ResearchJob.name, schema: ResearchJobSchema },
    ]),
    ResearchJobsModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
