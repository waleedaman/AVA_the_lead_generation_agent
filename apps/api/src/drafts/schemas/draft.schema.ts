import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DraftDocument = Draft & Document;

@Schema({ timestamps: true })
export class Draft {
  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
  campaignId: string;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  companyId: string;

  @Prop({ enum: ['email', 'linkedin', 'generic'], required: true })
  channel: string;

  @Prop({ type: Object })
  angle: any;

  @Prop()
  subject: string;

  @Prop()
  body?: string;

  @Prop({ required: true })
  message: string;

  @Prop()
  selectedAngle?: string;

  @Prop()
  reasoning?: string;

  @Prop([String])
  sourcesUsed?: string[];

  @Prop([String])
  riskFlags?: string[];

  @Prop()
  reviewerNotes?: string;

  @Prop()
  qualityScore: number;

  @Prop()
  qualityPassed: boolean;

  @Prop([String])
  qualityFlags: string[];

  @Prop({
    enum: [
      'needs_review',
      'pending_review',
      'approved',
      'edited',
      'rejected',
      'exported',
      'sent',
    ],
    default: 'needs_review',
  })
  status: string;
}

export const DraftSchema = SchemaFactory.createForClass(Draft);
