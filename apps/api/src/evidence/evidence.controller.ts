import { Controller, Get, Param } from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import { MongoIdPipe } from '../common/pipes/mongo-id.pipe';

@Controller()
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Get('companies/:companyId/evidence')
  findByCompany(@Param('companyId', MongoIdPipe) companyId: string) {
    return this.evidenceService.findByCompany(companyId);
  }

  @Get('evidence/:id')
  findOne(@Param('id', MongoIdPipe) id: string) {
    return this.evidenceService.findOne(id);
  }
}
