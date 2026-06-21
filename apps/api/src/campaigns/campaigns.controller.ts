import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { ResearchJobsService } from '../research-jobs/research-jobs.service';
import { MongoIdPipe } from '../common/pipes/mongo-id.pipe';

@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly researchJobsService: ResearchJobsService,
  ) {}

  @Post()
  create(@Body() createCampaignDto: CreateCampaignDto) {
    return this.campaignsService.create(createCampaignDto);
  }

  @Get()
  findAll() {
    return this.campaignsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', MongoIdPipe) id: string) {
    return this.campaignsService.findOne(id);
  }

  @Post(':id/research-all')
  researchAll(@Param('id', MongoIdPipe) id: string) {
    return this.researchJobsService.queueCampaignResearch(id);
  }

  @Post(':id/discover-companies')
  discoverCompanies(@Param('id', MongoIdPipe) id: string) {
    return this.campaignsService.discoverCompanies(id);
  }

  @Get(':id/research-jobs')
  findResearchJobs(@Param('id', MongoIdPipe) id: string) {
    return this.researchJobsService.findAll(id);
  }

  @Patch(':id')
  update(
    @Param('id', MongoIdPipe) id: string,
    @Body() updateCampaignDto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(id, updateCampaignDto);
  }

  @Delete(':id')
  remove(@Param('id', MongoIdPipe) id: string) {
    return this.campaignsService.remove(id);
  }
}
