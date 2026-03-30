import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { DisputesService } from '../services/disputes.service';
import { OpenDisputeDto, ResolveDisputeDto } from '../dto/dispute.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';

@ApiTags('Disputes')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(JwtAuthGuard)
export class DisputeController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post('transactions/:id/dispute')
  @ApiOperation({ summary: 'Open a dispute for a transaction' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  openDispute(
    @Param('id') transactionId: string,
    @Body() dto: OpenDisputeDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.disputesService.openTransactionDispute(transactionId, userId, dto);
  }

  @Get('disputes')
  @ApiOperation({ summary: 'Get current user disputes' })
  getMyDisputes(@Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.disputesService.getUserDisputes(userId);
  }

  @Get('disputes/:id')
  @ApiOperation({ summary: 'Get a specific dispute' })
  getDispute(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.disputesService.getDisputeById(id, userId);
  }
}

@ApiTags('Admin - Disputes')
@ApiBearerAuth('access-token')
@Controller('admin/disputes')
@UseGuards(JwtAuthGuard)
export class AdminDisputeController {
  constructor(private readonly disputesService: DisputesService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Admin: resolve or reject a dispute' })
  resolve(@Param('id') id: string, @Body() dto: ResolveDisputeDto) {
    return this.disputesService.adminResolveDispute(id, dto);
  }

  @Patch(':id/review')
  @ApiOperation({ summary: 'Admin: mark dispute as under review' })
  markUnderReview(@Param('id') id: string) {
    return this.disputesService.adminUpdateStatus(id, 'UNDER_REVIEW');
  }
}
