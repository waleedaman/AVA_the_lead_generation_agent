import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateSignalDto } from './dto/create-signal.dto';
import { UpdateSignalDto } from './dto/update-signal.dto';
import { Signal, SignalDocument } from './schemas/signal.schema';

@Injectable()
export class SignalsService {
  constructor(
    @InjectModel(Signal.name) private signalModel: Model<SignalDocument>,
  ) {}

  async create(createSignalDto: CreateSignalDto): Promise<Signal> {
    const createdSignal = new this.signalModel(createSignalDto);
    return createdSignal.save();
  }

  async findAll(
    filter: { companyId?: string; campaignId?: string } = {},
  ): Promise<Signal[]> {
    const query: Record<string, any> = {};
    if (filter.companyId) query.companyId = new Types.ObjectId(filter.companyId);
    if (filter.campaignId) query.campaignId = new Types.ObjectId(filter.campaignId);
    return this.signalModel
      .find(query)
      .sort({ relevanceScore: -1, createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<Signal> {
    const signal = await this.signalModel.findById(id).exec();
    if (!signal) {
      throw new NotFoundException(`Signal with ID ${id} not found`);
    }
    return signal;
  }

  async update(id: string, updateSignalDto: UpdateSignalDto): Promise<Signal> {
    const updatedSignal = await this.signalModel
      .findByIdAndUpdate(id, updateSignalDto, { new: true })
      .exec();
    if (!updatedSignal) {
      throw new NotFoundException(`Signal with ID ${id} not found`);
    }
    return updatedSignal;
  }

  async remove(id: string): Promise<Signal> {
    const deletedSignal = await this.signalModel.findByIdAndDelete(id).exec();
    if (!deletedSignal) {
      throw new NotFoundException(`Signal with ID ${id} not found`);
    }
    return deletedSignal;
  }
}
