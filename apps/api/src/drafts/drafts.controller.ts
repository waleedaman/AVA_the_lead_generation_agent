import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Res,
  Query,
} from '@nestjs/common';
import { DraftsService } from './drafts.service';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';
import type { Response } from 'express';
import { MongoIdPipe } from '../common/pipes/mongo-id.pipe';

@Controller()
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  @Post('drafts')
  create(@Body() createDraftDto: CreateDraftDto) {
    return this.draftsService.create(createDraftDto);
  }

  @Get('campaigns/:campaignId/drafts/export.csv')
  async exportCampaignCsv(
    @Param('campaignId', MongoIdPipe) campaignId: string,
    @Res() res: Response,
  ) {
    const csvData = await this.draftsService.exportApprovedCsv(campaignId);
    res.header('Content-Type', 'text/csv');
    res.attachment('approved_drafts.csv');
    return res.send(csvData);
  }

  @Get('drafts/export/csv')
  async exportCsv(
    @Res() res: Response,
    @Query('campaignId') campaignId?: string,
  ) {
    const csvData = await this.draftsService.exportApprovedCsv(campaignId);
    res.header('Content-Type', 'text/csv');
    res.attachment('approved_drafts.csv');
    return res.send(csvData);
  }

  @Get('campaigns/:campaignId/drafts')
  findByCampaign(@Param('campaignId', MongoIdPipe) campaignId: string) {
    return this.draftsService.findByCampaign(campaignId);
  }

  @Get('companies/:companyId/drafts')
  findByCompany(@Param('companyId', MongoIdPipe) companyId: string) {
    return this.draftsService.findByCompany(companyId);
  }

  @Get('drafts')
  findAll(
    @Query('campaignId') campaignId?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.draftsService.findAll({ campaignId, companyId });
  }

  @Get('drafts/:id')
  findOne(@Param('id', MongoIdPipe) id: string) {
    return this.draftsService.findOne(id);
  }

  @Patch('drafts/:id')
  update(
    @Param('id', MongoIdPipe) id: string,
    @Body() updateDraftDto: UpdateDraftDto,
  ) {
    return this.draftsService.update(id, updateDraftDto);
  }

  @Post('drafts/:id/approve')
  approve(
    @Param('id', MongoIdPipe) id: string,
    @Body('reviewerNotes') reviewerNotes?: string,
  ) {
    return this.draftsService.approve(id, reviewerNotes);
  }

  @Post('drafts/:id/reject')
  reject(
    @Param('id', MongoIdPipe) id: string,
    @Body('reviewerNotes') reviewerNotes?: string,
  ) {
    return this.draftsService.reject(id, reviewerNotes);
  }

  @Post('drafts/:id/regenerate')
  regenerate(@Param('id', MongoIdPipe) id: string) {
    return this.draftsService.regenerate(id);
  }

  @Delete('drafts/:id')
  remove(@Param('id', MongoIdPipe) id: string) {
    return this.draftsService.remove(id);
  }

  @Post('drafts/:id/send')
  async send(
    @Param('id', MongoIdPipe) id: string,
    @Body('contactEmail') contactEmail?: string,
  ) {
    return this.draftsService.sendEmail(id, contactEmail);
  }
}
