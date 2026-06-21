import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import { parse } from 'csv-parse/sync';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company, CompanyDocument } from './schemas/company.schema';
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

type CsvRecord = Record<string, string | undefined>;
type CompanyCreatePayload = CreateCompanyDto & {
  normalizedWebsite?: string;
  status: string;
};

@Injectable()
export class CompaniesService {
  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Evidence.name) private evidenceModel: Model<EvidenceDocument>,
    @InjectModel(Signal.name) private signalModel: Model<SignalDocument>,
    @InjectModel(Draft.name) private draftModel: Model<DraftDocument>,
    @InjectModel(Contact.name) private contactModel: Model<ContactDocument>,
    @InjectModel(ResearchJob.name)
    private researchJobModel: Model<ResearchJobDocument>,
  ) {}

  async create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    const normalizedWebsite = this.normalizeWebsite(createCompanyDto.website);
    await this.ensureNoDuplicate(
      createCompanyDto.campaignId,
      createCompanyDto.name,
      normalizedWebsite,
    );
    const dto: CompanyCreatePayload = {
      ...createCompanyDto,
      website: normalizedWebsite,
      normalizedWebsite,
      domain: normalizedWebsite
        ? this.domainFromUrl(normalizedWebsite)
        : createCompanyDto.domain,
      status: normalizedWebsite ? 'imported' : 'missing_info',
    };
    const createdCompany = new this.companyModel(dto);
    return createdCompany.save();
  }

  async findAll(campaignId?: string): Promise<Company[]> {
    const filter = campaignId ? { campaignId } : {};
    return this.companyModel.find(filter).exec();
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.companyModel.findById(id).exec();
    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    return company;
  }

  async update(
    id: string,
    updateCompanyDto: UpdateCompanyDto,
  ): Promise<Company> {
    if (
      Object.prototype.hasOwnProperty.call(updateCompanyDto, 'website') ||
      updateCompanyDto.name
    ) {
      const existing = await this.findOne(id);
      const nextWebsite = Object.prototype.hasOwnProperty.call(
        updateCompanyDto,
        'website',
      )
        ? this.normalizeWebsite(updateCompanyDto.website)
        : existing.normalizedWebsite;
      const duplicate = await this.findDuplicate(
        existing.campaignId.toString(),
        updateCompanyDto.name ?? existing.name,
        nextWebsite,
        id,
      );
      if (duplicate) {
        throw new BadRequestException(
          'Company already exists in this campaign',
        );
      }
    }

    const update = this.prepareCompanyUpdate(updateCompanyDto);
    const updatedCompany = await this.companyModel
      .findByIdAndUpdate(id, update, { new: true })
      .exec();
    if (!updatedCompany) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    return updatedCompany;
  }

  async remove(id: string): Promise<Company> {
    const deletedCompany = await this.companyModel.findByIdAndDelete(id).exec();
    if (!deletedCompany) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    await Promise.all([
      this.evidenceModel.deleteMany({ companyId: id }).exec(),
      this.signalModel.deleteMany({ companyId: id }).exec(),
      this.draftModel.deleteMany({ companyId: id }).exec(),
      this.contactModel.deleteMany({ companyId: id }).exec(),
      this.researchJobModel.deleteMany({ companyId: id }).exec(),
    ]);
    return deletedCompany;
  }

  async importFromCsv(
    campaignId: string,
    fileBuffer: Buffer,
  ): Promise<{ imported: number; skipped: number }> {
    let records: CsvRecord[];
    try {
      records = parse(fileBuffer, {
        columns: true,
        skip_empty_lines: true,
      });
    } catch {
      throw new BadRequestException(
        'Invalid CSV format. Please ensure you upload a plain text .csv file, not an Excel workbook (.xlsx).',
      );
    }

    let imported = 0;
    let skipped = 0;

    for (const record of records) {
      const name =
        record.company_name ||
        record.name ||
        record.Name ||
        record.Company ||
        record.company;
      const website = record.website || record.Website || record.Domain;
      const normalizedWebsite = this.normalizeWebsite(website);
      const linkedinUrl =
        record.linkedin_url ||
        record.linkedinUrl ||
        record.LinkedIn ||
        record.linkedin;
      const linkedinOrganizationId =
        record.linkedin_organization_id ||
        record.linkedinOrganizationId ||
        record.LinkedInOrganizationId ||
        record.linkedin_org_id ||
        record.linkedinOrgId;
      const notes = record.notes || record.Notes;

      let finalStatus = 'imported';

      if (!normalizedWebsite && !name) {
        skipped++;
        continue; // Needs at least a name
      }

      const existing = await this.findDuplicate(
        campaignId,
        name,
        normalizedWebsite,
      );
      if (existing) {
        skipped++;
        continue;
      }

      if (!normalizedWebsite) {
        finalStatus = 'missing_info';
      }

      const newCompany = new this.companyModel({
        campaignId,
        name: name ?? normalizedWebsite ?? 'Unknown company',
        website: normalizedWebsite,
        normalizedWebsite,
        domain: normalizedWebsite
          ? this.domainFromUrl(normalizedWebsite)
          : undefined,
        linkedinUrl,
        linkedinOrganizationId,
        notes,
        status: finalStatus,
      });
      await newCompany.save();
      imported++;
    }

    return { imported, skipped };
  }

  async enrichMissingInfo(campaignId: string): Promise<{ queued: number }> {
    const missingCompanies = await this.companyModel
      .find({ campaignId, status: 'missing_info' })
      .exec();

    if (missingCompanies.length === 0) {
      return { queued: 0 };
    }

    const enrichmentQueue = this.createEnrichmentQueue();

    let queued = 0;
    for (const comp of missingCompanies) {
      if (comp.status === 'researching' || comp.status === 'research_pending') {
        continue;
      }
      await this.enqueueCompany(
        enrichmentQueue,
        comp._id.toString(),
        comp.name,
      );

      comp.status = 'researching'; // Temporarily setting it to researching so it shows up in UI
      await comp.save();
      queued++;
    }

    await enrichmentQueue.close();
    return { queued };
  }

  async enrichCompanyWebsite(companyId: string): Promise<{ queued: boolean }> {
    const company = await this.companyModel.findById(companyId).exec();
    if (!company) {
      throw new NotFoundException(`Company with ID ${companyId} not found`);
    }
    this.assertNoActiveWork(company.status, companyId);

    const enrichmentQueue = this.createEnrichmentQueue();
    await this.enqueueCompany(
      enrichmentQueue,
      company._id.toString(),
      company.name,
    );
    await enrichmentQueue.close();

    company.status = 'research_pending';
    await company.save();

    return { queued: true };
  }

  private createEnrichmentQueue(): Queue {
    return new Queue('EnrichmentQueue', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    });
  }

  private async enqueueCompany(
    enrichmentQueue: Queue,
    companyId: string,
    companyName: string,
  ): Promise<void> {
    await enrichmentQueue.add(
      'enrich_company',
      {
        companyId,
        companyName,
      },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );
  }

  private prepareCompanyUpdate(
    updateCompanyDto: UpdateCompanyDto,
  ): Record<string, unknown> {
    const update: Record<string, unknown> = { ...updateCompanyDto };

    if (!Object.prototype.hasOwnProperty.call(updateCompanyDto, 'website')) {
      return update;
    }

    const website = this.normalizeWebsite(updateCompanyDto.website);
    delete update.website;

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};

    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined) {
        $set[key] = value;
      }
    }

    $unset.websiteSelectionReasoning = '';
    $unset.websiteSelectionConfidence = '';
    $unset.websiteSelectionModel = '';

    if (website) {
      $set.website = website;
      $set.normalizedWebsite = website;
      $set.domain = this.domainFromUrl(website);
      $set.status = updateCompanyDto.status ?? 'imported';
    } else {
      $unset.website = '';
      $unset.normalizedWebsite = '';
      $unset.domain = '';
      $set.status = updateCompanyDto.status ?? 'missing_info';
    }

    return { $set, $unset };
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
      return new URL(website).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      return website
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .split('/')[0]
        .toLowerCase();
    }
  }

  private async ensureNoDuplicate(
    campaignId: string,
    name: string,
    normalizedWebsite?: string,
  ): Promise<void> {
    const duplicate = await this.findDuplicate(
      campaignId,
      name,
      normalizedWebsite,
    );
    if (duplicate) {
      throw new BadRequestException('Company already exists in this campaign');
    }
  }

  private async findDuplicate(
    campaignId: string,
    name?: string,
    normalizedWebsite?: string,
    excludeCompanyId?: string,
  ): Promise<CompanyDocument | null> {
    const clauses: Record<string, unknown>[] = [];
    if (normalizedWebsite) {
      clauses.push({ normalizedWebsite });
    }
    const trimmedName = name?.trim();
    if (trimmedName) {
      clauses.push({
        name: new RegExp(`^${this.escapeRegExp(trimmedName)}$`, 'i'),
      });
    }
    if (clauses.length === 0) {
      return null;
    }
    const query: Record<string, unknown> = { campaignId, $or: clauses };
    if (excludeCompanyId) {
      query._id = { $ne: excludeCompanyId };
    }
    return this.companyModel.findOne(query).exec();
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private assertNoActiveWork(status: string, companyId: string): void {
    if (status === 'researching' || status === 'research_pending') {
      throw new BadRequestException(
        `Company ${companyId} already has active work`,
      );
    }
  }
}
