import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { DisputesService, OpenDisputeDto } from './disputes.service';
import { DisputeStatus } from './dispute.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';

class OpenDisputeBody {
  @IsUUID()
  transactionId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

class ResolveDisputeBody {
  @IsEnum([DisputeStatus.RESOLVED, DisputeStatus.REJECTED])
  status!: DisputeStatus.RESOLVED | DisputeStatus.REJECTED;

  @IsString()
  @IsNotEmpty()
  resolution!: string;
}

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@Controller('api/v1')
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @UseGuards(JwtAuthGuard)
  @Post('disputes')
  openDispute(@Body() body: OpenDisputeBody, @Req() req: AuthenticatedRequest) {
    const dto: OpenDisputeDto = {
      transactionId: body.transactionId,
      userId: req.user.id,
      reason: body.reason,
    };
    return this.disputesService.openDispute(dto);
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @Patch('admin/disputes/:id')
  resolveDispute(@Param('id') id: string, @Body() body: ResolveDisputeBody) {
    return this.disputesService.resolveDispute(id, body);
  }
}
