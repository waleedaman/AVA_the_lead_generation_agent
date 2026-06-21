import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CompanyDocument = Company & Document;

@Schema({ timestamps: true })
export class Company {
  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
  campaignId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  website?: string;

  @Prop({ index: true })
  normalizedWebsite?: string;

  @Prop([{ type: Object }])
  websiteCandidates?: Record<string, unknown>[];

  @Prop()
  websiteSelectionReasoning?: string;

  @Prop()
  websiteSelectionConfidence?: number;

  @Prop()
  websiteSelectionModel?: string;

  @Prop()
  domain?: string;

  @Prop()
  linkedinUrl?: string;

  @Prop()
  linkedinOrganizationId?: string;

  @Prop()
  notes?: string;

  @Prop({
    enum: [
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
    ],
    default: 'imported',
  })
  status: string;

  @Prop([String])
  industryTags: string[];

  @Prop([String])
  locationTags: string[];

  @Prop([String])
  keywordMatches: string[];

  @Prop()
  summary?: string;

  @Prop([String])
  productsServices?: string[];

  @Prop([String])
  painHypotheses?: string[];

  @Prop()
  fitScore?: number;

  @Prop({ enum: ['LOW', 'MEDIUM', 'HIGH'] })
  priority?: string;

  @Prop({ type: Object })
  scoreBreakdown?: Record<string, number>;

  @Prop([String])
  scoreReasoning?: string[];

  @Prop()
  evidenceCount?: number;

  @Prop()
  scoreVersion?: string;

  @Prop({ type: Object })
  oversight?: {
    verdict?: 'approve' | 'reject' | 'needs_human_check' | 'skipped';
    fitConfidence?: number;
    signalQuality?: number;
    buyingLikelihood?: number;
    recommendedAngle?: string;
    risks?: string[];
    reasoning?: string;
    model?: string;
    reviewedAt?: Date;
  };

  @Prop()
  lastResearchedAt?: Date;

  @Prop()
  lastResearchError?: string;
}

export const CompanySchema = SchemaFactory.createForClass(Company);
