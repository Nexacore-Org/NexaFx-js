import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApprovalService } from './approval.service';
import { CreateApprovalDto } from './dto/approval.dto';

/** Same routes and guards as before the move out of AdminController. */
@UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
@Controller('admin/approvals')
export class ApprovalController {
  constructor(private readonly approvals: ApprovalService) {}

  @Post('request')
  request(@Body() dto: CreateApprovalDto, @CurrentUser('id') adminId: string) {
    return this.approvals.requestAdminApproval(dto.actionType, dto.actionData, adminId);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.CREATED)
  approve(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser('id') adminId: string) {
    return this.approvals.approveAdminRequest(id, adminId);
  }
}
