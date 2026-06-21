import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProductProfileDocument = ProductProfile & Document;

@Schema({ timestamps: true })
export class ProductProfile {
  @Prop({ default: 'default', unique: true })
  key: string;

  @Prop({ default: '' })
  companyName: string;

  @Prop({ default: '' })
  productName: string;

  @Prop({ default: '' })
  website: string;

  @Prop({ default: '' })
  productPageUrl: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  valueProposition: string;

  @Prop([String])
  painPointsSolved: string[];

  @Prop([String])
  differentiators: string[];

  @Prop([String])
  proofPoints: string[];

  @Prop([String])
  complianceClaimsToAvoid: string[];

  @Prop({ default: '' })
  senderName: string;

  @Prop({ default: '' })
  senderRole: string;

  @Prop({ default: '' })
  defaultCta: string;
}

export const ProductProfileSchema = SchemaFactory.createForClass(ProductProfile);
