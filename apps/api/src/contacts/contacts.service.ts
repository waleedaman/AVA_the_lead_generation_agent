import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Contact, ContactDocument } from './schemas/contact.schema';

@Injectable()
export class ContactsService {
  constructor(
    @InjectModel(Contact.name) private contactModel: Model<ContactDocument>,
  ) {}

  async create(createData: Partial<Contact>): Promise<Contact> {
    const created = new this.contactModel(createData);
    return created.save();
  }

  async findAll(
    filter: { companyId?: string; campaignId?: string } = {},
  ): Promise<Contact[]> {
    const query: Record<string, any> = {};
    if (filter.companyId) query.companyId = new Types.ObjectId(filter.companyId);
    if (filter.campaignId) query.campaignId = new Types.ObjectId(filter.campaignId);
    
    return this.contactModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<Contact> {
    const contact = await this.contactModel.findById(id).exec();
    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`);
    }
    return contact;
  }

  async update(id: string, updateData: Partial<Contact>): Promise<Contact> {
    const updated = await this.contactModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`Contact with ID ${id} not found`);
    }
    return updated;
  }

  async remove(id: string): Promise<Contact> {
    const deleted = await this.contactModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`Contact with ID ${id} not found`);
    }
    return deleted;
  }
}
