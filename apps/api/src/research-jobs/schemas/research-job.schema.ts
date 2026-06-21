import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ResearchJobDocument = ResearchJob & Document;

@Schema({ timestamps: true })
export class ResearchJob {
  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
  campaignId: string;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  companyId: string;

  @Prop({
    enum: ['queued', 'running', 'completed', 'failed'],
    default: 'queued',
  })
  status: string;

  @Prop({
    enum: [
      'crawl',
      'linkedin',
      'enrich_sources',
      'extract_facts',
      'extract',
      'profile',
      'signals',
      'score',
      'contact_discovery',
      'oversight',
      'draft',
      'completed',
    ],
  })
  currentStep?: string;

  @Prop()
  error?: string;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;
}

export const ResearchJobSchema = SchemaFactory.createForClass(ResearchJob);
