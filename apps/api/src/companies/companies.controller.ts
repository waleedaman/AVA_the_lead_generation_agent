import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { ResearchJobsService } from '../research-jobs/research-jobs.service';
import { MongoIdPipe } from '../common/pipes/mongo-id.pipe';

@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly researchJobsService: ResearchJobsService,
  ) {}

  @Post()
  create(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.create(createCompanyDto);
  }

  @Post('import/:campaignId')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(
    @Param('campaignId') campaignId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.companiesService.importFromCsv(campaignId, file.buffer);
  }

  @Post('enrich/:campaignId')
  async enrichMissingInfo(
    @Param('campaignId', MongoIdPipe) campaignId: string,
  ) {
    return this.companiesService.enrichMissingInfo(campaignId);
  }

  @Post(':id/enrich-website')
  async enrichCompanyWebsite(@Param('id', MongoIdPipe) id: string) {
    return this.companiesService.enrichCompanyWebsite(id);
  }

  @Post(':id/research')
  async researchOne(
    @Param('id', MongoIdPipe) id: string,
    @Body() body?: { forceDraft?: boolean },
  ) {
    return this.researchJobsService.queueCompanyResearch(id, {
      forceDraft: body?.forceDraft === true,
    });
  }

  @Get()
  findAll(@Query('campaignId') campaignId?: string) {
    return this.companiesService.findAll(campaignId);
  }

  @Get(':id')
  findOne(@Param('id', MongoIdPipe) id: string) {
    return this.companiesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', MongoIdPipe) id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(id, updateCompanyDto);
  }

  @Delete(':id')
  remove(@Param('id', MongoIdPipe) id: string) {
    return this.companiesService.remove(id);
  }
}
