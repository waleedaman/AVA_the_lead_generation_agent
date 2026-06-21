import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { Company, CompanySchema } from './schemas/company.schema';
import { ResearchJobsModule } from '../research-jobs/research-jobs.module';
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
      { name: Company.name, schema: CompanySchema },
      { name: Evidence.name, schema: EvidenceSchema },
      { name: Signal.name, schema: SignalSchema },
      { name: Draft.name, schema: DraftSchema },
      { name: Contact.name, schema: ContactSchema },
      { name: ResearchJob.name, schema: ResearchJobSchema },
    ]),
    ResearchJobsModule,
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
