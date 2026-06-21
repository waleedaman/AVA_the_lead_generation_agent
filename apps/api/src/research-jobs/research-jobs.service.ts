import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import { CreateResearchJobDto } from './dto/create-research-job.dto';
import { UpdateResearchJobDto } from './dto/update-research-job.dto';
import {
  ResearchJob,
  ResearchJobDocument,
} from './schemas/research-job.schema';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import {
  Campaign,
  CampaignDocument,
} from '../campaigns/schemas/campaign.schema';

@Injectable()
export class ResearchJobsService {
  private readonly researchQueue = new Queue('ResearchQueue', {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
    },
  });

  constructor(
    @InjectModel(ResearchJob.name)
    private researchJobModel: Model<ResearchJobDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Campaign.name) private campaignModel: Model<CampaignDocument>,
  ) {}

  async create(
    createResearchJobDto: CreateResearchJobDto,
  ): Promise<ResearchJob> {
    const createdJob = new this.researchJobModel(createResearchJobDto);
    return createdJob.save();
  }

  async findAll(campaignId?: string, companyId?: string): Promise<ResearchJob[]> {
    const filter: Record<string, string> = {};
    if (campaignId) {
      filter.campaignId = campaignId;
    }
    if (companyId) {
      filter.companyId = companyId;
    }
    return this.researchJobModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async queueCompanyResearch(
    companyId: string,
    options: { forceDraft?: boolean } = {},
  ): Promise<ResearchJob> {
    const company = await this.companyModel.findById(companyId).exec();
    if (!company) {
      throw new NotFoundException(`Company with ID ${companyId} not found`);
    }

    if (!company.website) {
      throw new BadRequestException(
        `Company ${companyId} has no website to research`,
      );
    }
    if (
      company.status === 'researching' ||
      company.status === 'research_pending'
    ) {
      throw new BadRequestException(
        `Company ${companyId} already has active research`,
      );
    }

    const activeJob = await this.researchJobModel
      .findOne({
        companyId,
        status: { $in: ['queued', 'running'] },
      })
      .exec();
    if (activeJob) {
      throw new BadRequestException(
        `Company ${companyId} already has queued or running research`,
      );
    }

    const campaignId = company.campaignId.toString();
    const campaign = await this.campaignModel.findById(campaignId).exec();
    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${campaignId} not found`);
    }

    const createdJob = await new this.researchJobModel({
      campaignId,
      companyId,
      status: 'queued',
      currentStep: 'crawl',
    }).save();

    await this.researchQueue.add(
      'research_company',
      {
        researchJobId: createdJob._id.toString(),
        campaignId,
        companyId,
        website: company.website,
        forceDraft: options.forceDraft === true,
      },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );

    await this.companyModel
      .findByIdAndUpdate(companyId, {
        $set: { status: 'research_pending' },
        $unset: { lastResearchError: '' },
      })
      .exec();

    return createdJob;
  }

  async queueCampaignResearch(
    campaignId: string,
  ): Promise<{ queued: number; skipped: number }> {
    const campaign = await this.campaignModel.findById(campaignId).exec();
    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${campaignId} not found`);
    }

    const companies = await this.companyModel.find({ campaignId }).exec();
    let queued = 0;
    let skipped = 0;

    for (const company of companies) {
      if (
        !company.website ||
        company.status === 'researching' ||
        company.status === 'research_pending'
      ) {
        skipped += 1;
        continue;
      }

      await this.queueCompanyResearch(company._id.toString());
      queued += 1;
    }

    return { queued, skipped };
  }

  async findOne(id: string): Promise<ResearchJob> {
    const job = await this.researchJobModel.findById(id).exec();
    if (!job) {
      throw new NotFoundException(`ResearchJob with ID ${id} not found`);
    }
    return job;
  }

  async update(
    id: string,
    updateResearchJobDto: UpdateResearchJobDto,
  ): Promise<ResearchJob> {
    const updatedJob = await this.researchJobModel
      .findByIdAndUpdate(id, updateResearchJobDto, { new: true })
      .exec();
    if (!updatedJob) {
      throw new NotFoundException(`ResearchJob with ID ${id} not found`);
    }
    return updatedJob;
  }

  async remove(id: string): Promise<ResearchJob> {
    const deletedJob = await this.researchJobModel.findByIdAndDelete(id).exec();
    if (!deletedJob) {
      throw new NotFoundException(`ResearchJob with ID ${id} not found`);
    }
    return deletedJob;
  }
}
