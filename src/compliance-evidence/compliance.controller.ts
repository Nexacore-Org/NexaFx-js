import { Controller, Get, Patch, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ComplianceCaseService } from '../services/compliance-case.service';
import { RolesGuard } from '../../auth/guards/roles.guard'; // Adjust path as needed
import { Roles } from '../../auth/decorators/roles.decorator'; // Adjust path as needed

@Controller('admin/compliance/cases')
export class ComplianceCaseController {
  constructor(private readonly caseService: ComplianceCaseService) {}

  @Get()
  async getCases(
    @Query('status') status?: any,
    @Query('assignedTo') assignedTo?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page = 1,
  ) {
    return this.caseService.getCases({
      status,
      assignedTo,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    }, page);
  }

  @Patch(':id/assign')
  @UseGuards(RolesGuard)
  @Roles('compliance_officer') // Restricts to compliance officers
  async assignCase(@Param('id') id: string, @Body('officerId') officerId: string) {
    return this.caseService.assignOfficer(id, officerId);
  }

  @Post(':id/notes')
  async addNote(@Param('id') id: string, @Body('note') note: string, @Body('authorId') authorId: string) {
    return this.caseService.addNote(id, note, authorId);
  }

  @Post(':id/resolve')
  async resolveCase(
    @Param('id') id: string, 
    @Body('resolutionType') resolutionType: string, 
    @Body('summary') summary: string
  ) {
    return this.caseService.resolveCase(id, resolutionType, summary);
  }
}