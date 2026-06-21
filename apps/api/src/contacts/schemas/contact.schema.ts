import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ContactDocument = Contact & Document;

@Schema({ timestamps: true })
export class Contact {
  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
  campaignId: string;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  companyId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  title?: string;

  @Prop()
  email?: string;

  @Prop()
  linkedinUrl?: string;

  @Prop()
  roleMatchScore?: number;

  @Prop()
  emailConfidence?: number;

  @Prop()
  emailRoutingType?: string;

  @Prop()
  emailRoutingNote?: string;

  @Prop()
  source?: string;

  @Prop()
  sourceUrl?: string;

  @Prop()
  providerConfidence?: number;

  @Prop({ default: false })
  recommended?: boolean;

  @Prop({ default: 'discovered' })
  status: string; // discovered, emailed, replied, bounced
}

export const ContactSchema = SchemaFactory.createForClass(Contact);
