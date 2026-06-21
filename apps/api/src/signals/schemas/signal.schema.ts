import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SignalDocument = Signal & Document;

@Schema({ timestamps: true })
export class Signal {
  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
  campaignId: string;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  companyId: string;

  @Prop({ type: Types.ObjectId, ref: 'Evidence' })
  evidenceId?: string;

  @Prop({ required: true })
  signalType: string;

  @Prop()
  signalKey?: string;

  @Prop({ default: 'buying_signal' })
  factType?: string;

  @Prop()
  fact?: string;

  @Prop()
  description: string;

  @Prop()
  relevanceScore: number;

  @Prop()
  confidence: number;

  @Prop()
  evidenceSnippet: string;

  @Prop()
  sourceUrl: string;

  @Prop()
  sourceType?: string;

  @Prop()
  observedAt?: Date;

  @Prop()
  researchRunId?: string;

  @Prop()
  extractionModel?: string;
}

export const SignalSchema = SchemaFactory.createForClass(Signal);
