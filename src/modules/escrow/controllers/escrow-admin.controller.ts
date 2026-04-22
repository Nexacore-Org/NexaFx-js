import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { EscrowService } from '../services/escrow.service';

@ApiTags('Escrow Admin')
@ApiBearerAuth('access-token')
@Controller('admin/escrow')
@UseGuards(JwtAuthGuard)
export class EscrowAdminController {
  constructor(private readonly escrowService: EscrowService) {}

  @Get('analytics')
  @ApiOperation({ summary: 'Get escrow analytics: locked value, avg duration, release/dispute rates' })
  async getAnalytics() {
    return this.escrowService.getAnalytics();
  }
}
