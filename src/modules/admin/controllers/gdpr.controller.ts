import { Controller, Post, Param, Body, UseGuards, Patch } from '@nestjs/common';
import { GdprService } from '../services/gdpr.service';
import { DataRetentionService } from '../../../exxagerated/data-retention.service'; // Keeping your specific path
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';

@Controller('admin')
@UseGuards(RolesGuard)
export class GdprController {
  constructor(
    private readonly gdprService: GdprService,
    private readonly retentionService: DataRetentionService
  ) {}

  @Post('users/:id/gdpr-delete')
  @Roles('admin', 'compliance_officer')
  async deleteUserGdpr(@Param('id') id: string) {
    return this.gdprService.processGdprDeletion(id);
  }

  @Patch('retention-policy')
  @Roles('admin')
  async updateRetentionPolicy(@Body('entity') entity: string, @Body('months') months: number) {
    this.retentionService.setRetentionPolicy(entity, months);
    return { success: true, entity, thresholdMonths: months };
  }
}