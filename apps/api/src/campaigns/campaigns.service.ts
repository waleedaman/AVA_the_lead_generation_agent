import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { Campaign, CampaignDocument } from './schemas/campaign.schema';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import {
  Evidence,
  EvidenceDocument,
} from '../evidence/schemas/evidence.schema';
import { Signal, SignalDocument } from '../signals/schemas/signal.schema';
import { Draft, DraftDocument } from '../drafts/schemas/draft.schema';
import { Contact, ContactDocument } from '../contacts/schemas/contact.schema';
import {
  ResearchJob,
  ResearchJobDocument,
} from '../research-jobs/schemas/research-job.schema';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectModel(Campaign.name) private campaignModel: Model<CampaignDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Evidence.name) private evidenceModel: Model<EvidenceDocument>,
    @InjectModel(Signal.name) private signalModel: Model<SignalDocument>,
    @InjectModel(Draft.name) private draftModel: Model<DraftDocument>,
    @InjectModel(Contact.name) private contactModel: Model<ContactDocument>,
    @InjectModel(ResearchJob.name)
    private researchJobModel: Model<ResearchJobDocument>,
  ) {}

  async create(createCampaignDto: CreateCampaignDto): Promise<Campaign> {
    const createdCampaign = new this.campaignModel(createCampaignDto);
    return createdCampaign.save();
  }

  async findAll(): Promise<Campaign[]> {
    return this.campaignModel.find().exec();
  }

  async findOne(id: string): Promise<Campaign> {
    const campaign = await this.campaignModel.findById(id).exec();
    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }
    return campaign;
  }

  async update(
    id: string,
    updateCampaignDto: UpdateCampaignDto,
  ): Promise<Campaign> {
    const updatedCampaign = await this.campaignModel
      .findByIdAndUpdate(id, updateCampaignDto, { new: true })
      .exec();
    if (!updatedCampaign) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }
    return updatedCampaign;
  }

  async discoverCompanies(
    id: string,
  ): Promise<{ imported: number; skipped: number }> {
    const campaign = await this.findOne(id);
    const profile = (campaign as any).industryProfile ?? {};
    const sources: string[] = Array.isArray(profile.discoverySources)
      ? profile.discoverySources
      : [];
    let imported = 0;
    let skipped = 0;

    for (const source of sources) {
      const candidate = this.parseDiscoverySource(source);
      if (!candidate) {
        skipped += 1;
        continue;
      }

      const normalizedWebsite = this.normalizeWebsite(candidate.website);
      const clauses: Record<string, unknown>[] = [
        { name: new RegExp(`^${this.escapeRegExp(candidate.name)}$`, 'i') },
      ];
      if (normalizedWebsite) {
        clauses.push({ normalizedWebsite });
      }

      const existing = await this.companyModel
        .findOne({ campaignId: id, $or: clauses })
        .exec();
      if (existing) {
        skipped += 1;
        continue;
      }

      await new this.companyModel({
        campaignId: id,
        name: candidate.name,
        website: normalizedWebsite,
        normalizedWebsite,
        domain: normalizedWebsite
          ? this.domainFromUrl(normalizedWebsite)
          : undefined,
        notes: `Discovered from: ${source}`,
        status: normalizedWebsite ? 'imported' : 'missing_info',
      }).save();
      imported += 1;
    }

    return { imported, skipped };
  }

  async remove(id: string): Promise<Campaign> {
    const deletedCampaign = await this.campaignModel
      .findByIdAndDelete(id)
      .exec();
    if (!deletedCampaign) {
      throw new NotFoundException(`Campaign with ID ${id} not found`);
    }
    await Promise.all([
      this.companyModel.deleteMany({ campaignId: id }).exec(),
      this.evidenceModel.deleteMany({ campaignId: id }).exec(),
      this.signalModel.deleteMany({ campaignId: id }).exec(),
      this.draftModel.deleteMany({ campaignId: id }).exec(),
      this.contactModel.deleteMany({ campaignId: id }).exec(),
      this.researchJobModel.deleteMany({ campaignId: id }).exec(),
    ]);
    return deletedCampaign;
  }

  private parseDiscoverySource(
    source: string,
  ): { name: string; website?: string } | null {
    const trimmed = source?.trim();
    if (!trimmed) {
      return null;
    }

    const parts = trimmed
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return { name: parts[0], website: parts[1] };
    }

    if (/^https?:\/\//i.test(trimmed) || /^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) {
      const domain = this.domainFromUrl(trimmed);
      const name = domain
        .split('.')[0]
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
      return { name, website: trimmed };
    }

    return { name: trimmed };
  }

  private normalizeWebsite(website?: string): string | undefined {
    const trimmed = website?.trim();
    if (!trimmed) {
      return undefined;
    }
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  private domainFromUrl(website: string): string {
    try {
      return new URL(this.normalizeWebsite(website) ?? website).hostname
        .replace(/^www\./i, '')
        .toLowerCase();
    } catch {
      return website
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .split('/')[0]
        .toLowerCase();
    }
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
