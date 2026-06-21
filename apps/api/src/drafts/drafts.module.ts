import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DraftsService } from './drafts.service';
import { DraftsController } from './drafts.controller';
import { Draft, DraftSchema } from './schemas/draft.schema';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { ResearchJobsModule } from '../research-jobs/research-jobs.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Draft.name, schema: DraftSchema },
      { name: Company.name, schema: CompanySchema },
    ]),
    ResearchJobsModule,
  ],
  controllers: [DraftsController],
  providers: [DraftsService],
})
export class DraftsModule {}
