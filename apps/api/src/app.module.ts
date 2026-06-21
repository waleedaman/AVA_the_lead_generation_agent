import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CompaniesModule } from './companies/companies.module';
import { ResearchJobsModule } from './research-jobs/research-jobs.module';
import { SignalsModule } from './signals/signals.module';
import { DraftsModule } from './drafts/drafts.module';
import { EvidenceModule } from './evidence/evidence.module';
import { ContactsModule } from './contacts/contacts.module';
import { ProductProfileModule } from './product-profile/product-profile.module';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/lead-agent',
    ),
    CampaignsModule,
    CompaniesModule,
    ResearchJobsModule,
    SignalsModule,
    DraftsModule,
    EvidenceModule,
    ContactsModule,
    ProductProfileModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
