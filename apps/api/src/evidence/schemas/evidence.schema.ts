import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EvidenceDocument = Evidence & Document;

@Schema({ timestamps: true, collection: 'evidence' })
export class Evidence {
  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
  campaignId: string;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  companyId: string;

  @Prop({
    enum: [
      'website_homepage',
      'website_about',
      'website_services',
      'website_product',
      'website_blog',
      'website_news',
      'website_careers',
      'website_jobs',
      'website_case_study',
      'website_event',
      'website_directory',
      'website_contact',
      'website_impressum',
      'linkedin_company_post',
      'linkedin_company_profile',
      'search_result',
      'job_posting',
      'conference_page',
      'association_member_page',
      'unknown_page',
    ],
    default: 'unknown_page',
  })
  sourceType: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  pageTitle?: string;

  @Prop()
  rawText?: string;

  @Prop()
  cleanedText?: string;

  @Prop()
  summary?: string;

  @Prop([String])
  detectedKeywords?: string[];

  @Prop([String])
  detectedSignals?: string[];

  @Prop({ default: 0.75 })
  confidence: number;

  @Prop()
  contentHash?: string;

  @Prop({ index: true })
  normalizedUrl?: string;

  @Prop()
  provider?: string;

  @Prop()
  providerQuery?: string;

  @Prop({ type: Object })
  providerStatus?: Record<string, unknown>;

  @Prop()
  sourceRank?: number;

  @Prop()
  sourceConfidence?: number;

  @Prop()
  publishedAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop()
  retrievalStatus?: string;

  @Prop({ index: true })
  researchRunId?: string;

  @Prop()
  retrievedAt?: Date;
}

export const EvidenceSchema = SchemaFactory.createForClass(Evidence);
EvidenceSchema.index({ companyId: 1, retrievedAt: -1 });
EvidenceSchema.index({ companyId: 1, normalizedUrl: 1, contentHash: 1 });
