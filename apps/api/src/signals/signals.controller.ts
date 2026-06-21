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
import { SignalsService } from './signals.service';
import { CreateSignalDto } from './dto/create-signal.dto';
import { UpdateSignalDto } from './dto/update-signal.dto';
import { MongoIdPipe } from '../common/pipes/mongo-id.pipe';

@Controller()
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Post('signals')
  create(@Body() createSignalDto: CreateSignalDto) {
    return this.signalsService.create(createSignalDto);
  }

  @Get('companies/:companyId/signals')
  findByCompany(@Param('companyId', MongoIdPipe) companyId: string) {
    return this.signalsService.findAll({ companyId });
  }

  @Get('signals')
  findAll(
    @Query('companyId') companyId?: string,
    @Query('campaignId') campaignId?: string,
  ) {
    return this.signalsService.findAll({ companyId, campaignId });
  }

  @Get('signals/:id')
  findOne(@Param('id', MongoIdPipe) id: string) {
    return this.signalsService.findOne(id);
  }

  @Patch('signals/:id')
  update(
    @Param('id', MongoIdPipe) id: string,
    @Body() updateSignalDto: UpdateSignalDto,
  ) {
    return this.signalsService.update(id, updateSignalDto);
  }

  @Delete('signals/:id')
  remove(@Param('id', MongoIdPipe) id: string) {
    return this.signalsService.remove(id);
  }
}
