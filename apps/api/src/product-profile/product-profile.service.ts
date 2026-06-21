import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UpdateProductProfileDto } from './dto/update-product-profile.dto';
import {
  ProductProfile,
  ProductProfileDocument,
} from './schemas/product-profile.schema';

const DEFAULT_PROFILE = {
  key: 'default',
  companyName: 'Aegis SafeForge',
  productName: 'Aegis SafeForge',
  website: '',
  productPageUrl: '',
  description:
    'AI-assisted workspace for safety-critical and compliance-oriented engineering workflows.',
  valueProposition:
    'Helps engineering teams turn evidence, standards context, and review decisions into traceable working material faster.',
  painPointsSolved: [
    'Manual preparation for safety and risk reviews',
    'Scattered evidence across websites, documents, and notes',
    'Slow handoff from research to outreach context',
  ],
  differentiators: [
    'Evidence-backed qualification',
    'Human approval before outreach',
    'Traceable facts instead of generic LLM summaries',
  ],
  proofPoints: [],
  complianceClaimsToAvoid: [
    'guaranteed compliance',
    'certified compliance',
    'ensure compliance',
    'guaranteed certification',
  ],
  senderName: 'Muhammad',
  senderRole: '',
  defaultCta: 'Would it be useful to compare notes on where this could fit?',
};

@Injectable()
export class ProductProfileService {
  constructor(
    @InjectModel(ProductProfile.name)
    private productProfileModel: Model<ProductProfileDocument>,
  ) {}

  async findDefault(): Promise<ProductProfile> {
    const profile = await this.productProfileModel
      .findOneAndUpdate(
        { key: 'default' },
        { $setOnInsert: DEFAULT_PROFILE },
        { new: true, upsert: true },
      )
      .exec();
    return profile;
  }

  async updateDefault(
    updateProductProfileDto: UpdateProductProfileDto,
  ): Promise<ProductProfile> {
    const normalized = this.normalize(updateProductProfileDto);
    const profile = await this.productProfileModel
      .findOneAndUpdate(
        { key: 'default' },
        { $set: { ...normalized, key: 'default' } },
        { new: true, upsert: true },
      )
      .exec();
    return profile;
  }

  private normalize(payload: UpdateProductProfileDto): UpdateProductProfileDto {
    return {
      ...payload,
      painPointsSolved: this.cleanList(payload.painPointsSolved),
      differentiators: this.cleanList(payload.differentiators),
      proofPoints: this.cleanList(payload.proofPoints),
      complianceClaimsToAvoid: this.cleanList(payload.complianceClaimsToAvoid),
    };
  }

  private cleanList(value?: string[]): string[] | undefined {
    if (!Array.isArray(value)) return value;
    return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
  }
}
