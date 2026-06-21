import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';
import { Draft, DraftDocument } from './schemas/draft.schema';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { ResearchJobsService } from '../research-jobs/research-jobs.service';

@Injectable()
export class DraftsService {
  constructor(
    @InjectModel(Draft.name) private draftModel: Model<DraftDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    private readonly researchJobsService: ResearchJobsService,
  ) {}

  async create(createDraftDto: CreateDraftDto): Promise<Draft> {
    const normalized = this.normalizeDraftPayload(createDraftDto);
    const createdDraft = new this.draftModel(normalized);
    return createdDraft.save();
  }

  async findAll(
    filter: { campaignId?: string; companyId?: string } = {},
  ): Promise<Draft[]> {
    const query: Record<string, any> = {};
    if (filter.campaignId) query.campaignId = new Types.ObjectId(filter.campaignId);
    if (filter.companyId) query.companyId = new Types.ObjectId(filter.companyId);
    return this.draftModel
      .find(query)
      .sort({ updatedAt: -1 })
      .populate('companyId', 'name website fitScore priority')
      .exec();
  }

  async findByCampaign(campaignId: string): Promise<Draft[]> {
    return this.findAll({ campaignId });
  }

  async findByCompany(companyId: string): Promise<Draft[]> {
    return this.findAll({ companyId });
  }

  async findOne(id: string): Promise<Draft> {
    const draft = await this.draftModel.findById(id).exec();
    if (!draft) {
      throw new NotFoundException(`Draft with ID ${id} not found`);
    }
    return draft;
  }

  async update(id: string, updateDraftDto: UpdateDraftDto): Promise<Draft> {
    const normalized = this.normalizeDraftPayload(updateDraftDto);
    if (
      !normalized.status &&
      (normalized.message || normalized.body || normalized.reviewerNotes)
    ) {
      normalized.status = 'edited';
    }

    const updatedDraft = await this.draftModel
      .findByIdAndUpdate(id, normalized, { new: true })
      .exec();
    if (!updatedDraft) {
      throw new NotFoundException(`Draft with ID ${id} not found`);
    }
    return updatedDraft;
  }

  async remove(id: string): Promise<Draft> {
    const deletedDraft = await this.draftModel.findByIdAndDelete(id).exec();
    if (!deletedDraft) {
      throw new NotFoundException(`Draft with ID ${id} not found`);
    }
    return deletedDraft;
  }

  async approve(id: string, reviewerNotes?: string): Promise<Draft> {
    const draft = await this.draftModel
      .findByIdAndUpdate(
        id,
        { status: 'approved', reviewerNotes },
        { new: true },
      )
      .exec();
    if (!draft) {
      throw new NotFoundException(`Draft with ID ${id} not found`);
    }
    await this.companyModel
      .findByIdAndUpdate(draft.companyId, { status: 'approved' })
      .exec();
    return draft;
  }

  async reject(id: string, reviewerNotes?: string): Promise<Draft> {
    const draft = await this.draftModel
      .findByIdAndUpdate(
        id,
        { status: 'rejected', reviewerNotes },
        { new: true },
      )
      .exec();
    if (!draft) {
      throw new NotFoundException(`Draft with ID ${id} not found`);
    }
    await this.companyModel
      .findByIdAndUpdate(draft.companyId, { status: 'rejected' })
      .exec();
    return draft;
  }

  async regenerate(id: string): Promise<{ draft: Draft; job: unknown }> {
    const draft = await this.findOne(id);
    const updatedDraft = await this.draftModel
      .findByIdAndUpdate(
        id,
        { status: 'rejected', reviewerNotes: 'Regeneration requested' },
        { new: true },
      )
      .exec();
    const job = await this.researchJobsService.queueCompanyResearch(
      draft.companyId.toString(),
    );
    return { draft: updatedDraft as Draft, job };
  }

  async exportApprovedCsv(campaignId?: string): Promise<string> {
    const filter: Record<string, string> = { status: 'approved' };
    if (campaignId) filter.campaignId = campaignId;
    const approvedDrafts = await this.draftModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .exec();

    let csv =
      'company_name,website,linkedin_url,fit_score,priority,selected_angle,subject,message,sources,status,last_researched_at\n';

    for (const draft of approvedDrafts) {
      const company = await this.findCompanyForDraft(draft);
      const angle = draft.angle as { selected_angle?: string } | undefined;
      const row: string[] = [
        company?.name || 'Unknown',
        company?.website || '',
        company?.linkedinUrl || '',
        company?.fitScore?.toString() || '',
        company?.priority || '',
        draft.selectedAngle || angle?.selected_angle || '',
        draft.subject || '',
        draft.message || draft.body || '',
        (draft.sourcesUsed || []).join('; '),
        draft.status,
        company?.lastResearchedAt?.toISOString?.() || '',
      ];
      csv += `${row.map((value) => this.csvEscape(value)).join(',')}\n`;
    }

    return csv;
  }

  async sendEmail(id: string, contactEmail?: string): Promise<Draft> {
    const draft = await this.findOne(id);
    const company = await this.findCompanyForDraft(draft as any);

    if (draft.status !== 'approved') {
      throw new Error('Only approved drafts can be sent.');
    }

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const toEmail = contactEmail || process.env.TEST_RECEIVER_EMAIL || process.env.SMTP_USER; // Send to self if no specific target found in mock

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Agent Outreach" <no-reply@example.com>',
      to: toEmail,
      subject: draft.subject,
      text: draft.message || draft.body,
    });

    const updatedDraft = await this.draftModel
      .findByIdAndUpdate(
        id,
        { status: 'sent' },
        { new: true }
      )
      .exec();

    return updatedDraft as Draft;
  }

  private normalizeDraftPayload<
    T extends Partial<CreateDraftDto | UpdateDraftDto>,
  >(payload: T): T {
    const normalized = { ...payload } as T & {
      message?: string;
      body?: string;
      status?: string;
    };
    if (!normalized.message && normalized.body) {
      normalized.message = normalized.body;
    }
    if (!normalized.body && normalized.message) {
      normalized.body = normalized.message;
    }
    if (normalized.status === 'pending_review') {
      normalized.status = 'needs_review';
    }
    return normalized;
  }

  private async findCompanyForDraft(
    draft: DraftDocument,
  ): Promise<CompanyDocument | null> {
    const companyId = draft.companyId?.toString();
    if (!companyId || !Types.ObjectId.isValid(companyId)) {
      return null;
    }
    return this.companyModel.findById(companyId).exec();
  }

  private csvEscape(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }
}
