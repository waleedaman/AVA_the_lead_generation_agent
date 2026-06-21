import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CampaignDocument = Campaign & Document;

@Schema({ timestamps: true })
export class Campaign {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop([String])
  targetIndustries: string[];

  @Prop([String])
  targetRoles: string[];

  @Prop([String])
  regions: string[];

  @Prop([String])
  keywords: string[];

  @Prop([String])
  exclusionKeywords: string[];

  @Prop({ type: Object })
  industryProfile?: {
    targetCompanyTypes?: string[];
    buyingSignals?: string[];
    negativeSignals?: string[];
    targetRoles?: string[];
    regions?: string[];
    scoringWeights?: Record<string, number>;
    minimumScoreForContacts?: number;
    minimumScoreForOversight?: number;
    minimumScoreForDraft?: number;
    discoverySources?: string[];
  };

  @Prop({ default: '' })
  offer: string;

  @Prop({ default: '' })
  cta: string;

  @Prop({
    enum: ['technical', 'friendly', 'formal', 'concise'],
    default: 'technical',
  })
  tone: string;

  @Prop({ enum: ['email', 'linkedin', 'generic'], default: 'email' })
  channel: string;

  @Prop({ default: false })
  approvalRequired: boolean;

  @Prop()
  createdBy: string;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);
