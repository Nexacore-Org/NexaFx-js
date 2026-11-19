import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApprovalService } from './approval.service';
import { CreateApprovalDto, RejectApprovalDto } from './dto/approval.dto';

/** Same routes and guards as before the move out of AdminController. */
@UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
@Controller('admin/approvals')
export class ApprovalController {
  constructor(private readonly approvals: ApprovalService) {}

  @Post('request')
  request(@Body() dto: CreateApprovalDto, @CurrentUser('id') adminId: string) {
    return this.approvals.requestAdminApproval(dto.actionType, dto.actionData, adminId);
  }

  @Get()
  list() {
    return this.approvals.listAdminRequests();
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectApprovalDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.approvals.rejectAdminRequest(id, adminId, dto.reason);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.CREATED)
  approve(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser('id') adminId: string) {
    return this.approvals.approveAdminRequest(id, adminId);
  }
}
