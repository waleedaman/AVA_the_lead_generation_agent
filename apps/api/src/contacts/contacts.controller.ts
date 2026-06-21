import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { MongoIdPipe } from '../common/pipes/mongo-id.pipe';
import { Contact } from './schemas/contact.schema';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  create(@Body() createData: Partial<Contact>) {
    return this.contactsService.create(createData);
  }

  @Get()
  findAll(
    @Query('companyId') companyId?: string,
    @Query('campaignId') campaignId?: string,
  ) {
    return this.contactsService.findAll({ companyId, campaignId });
  }

  @Get(':id')
  findOne(@Param('id', MongoIdPipe) id: string) {
    return this.contactsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', MongoIdPipe) id: string,
    @Body() updateData: Partial<Contact>,
  ) {
    return this.contactsService.update(id, updateData);
  }

  @Delete(':id')
  remove(@Param('id', MongoIdPipe) id: string) {
    return this.contactsService.remove(id);
  }
}
