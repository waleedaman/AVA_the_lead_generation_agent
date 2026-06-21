import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ResearchJobsService } from './research-jobs.service';
import { CreateResearchJobDto } from './dto/create-research-job.dto';
import { UpdateResearchJobDto } from './dto/update-research-job.dto';
import { MongoIdPipe } from '../common/pipes/mongo-id.pipe';

@Controller('research-jobs')
export class ResearchJobsController {
  constructor(private readonly researchJobsService: ResearchJobsService) {}

  @Post()
  create(@Body() createResearchJobDto: CreateResearchJobDto) {
    return this.researchJobsService.create(createResearchJobDto);
  }

  @Get()
  findAll(
    @Query('campaignId') campaignId?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.researchJobsService.findAll(campaignId, companyId);
  }

  @Get(':id')
  findOne(@Param('id', MongoIdPipe) id: string) {
    return this.researchJobsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', MongoIdPipe) id: string,
    @Body() updateResearchJobDto: UpdateResearchJobDto,
  ) {
    return this.researchJobsService.update(id, updateResearchJobDto);
  }

  @Delete(':id')
  remove(@Param('id', MongoIdPipe) id: string) {
    return this.researchJobsService.remove(id);
  }
}
