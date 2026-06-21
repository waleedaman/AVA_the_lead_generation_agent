import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Evidence, EvidenceDocument } from './schemas/evidence.schema';

@Injectable()
export class EvidenceService {
  constructor(
    @InjectModel(Evidence.name) private evidenceModel: Model<EvidenceDocument>,
  ) {}

  async findByCompany(companyId: string): Promise<Evidence[]> {
    const query: Record<string, any> = { companyId: new Types.ObjectId(companyId) };
    return this.evidenceModel
      .find(query)
      .sort({ retrievedAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<Evidence> {
    const evidence = await this.evidenceModel.findById(id).exec();
    if (!evidence) {
      throw new NotFoundException(`Evidence with ID ${id} not found`);
    }
    return evidence;
  }
}
