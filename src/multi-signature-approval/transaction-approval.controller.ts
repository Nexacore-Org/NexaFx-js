import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { TransactionApprovalService } from './transaction-approval.service';
import { ApproveTransactionDto, RejectTransactionDto } from './approval.dto';
import { JwtAuthGuard } from '../modules/auth/guards/jwt.guard';
import { RolesGuard } from '../modules/auth/guards/roles.guard';
import { Roles } from '../modules/auth/decorators/roles.decorator';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';

class ForceApproveDto {
  @IsString()
  @MinLength(5)
  reason: string;
}

@ApiTags('Transaction Approvals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionApprovalController {
  constructor(private readonly approvalService: TransactionApprovalService) {}

  @Post(':id/approve')
  @Roles('admin', 'compliance_officer', 'finance_manager')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending high-value transaction' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiResponse({ status: 200, description: 'Transaction approved successfully' })
  @ApiResponse({ status: 400, description: 'Transaction not pending or already actioned' })
  @ApiResponse({ status: 403, description: 'Insufficient role or self-approval attempt' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveTransactionDto,
    @CurrentUser() user: { id: string; email: string; role: string },
  ) {
    const { transaction, approval } = await this.approvalService.approveTransaction(
      id,
      { id: user.id, email: user.email, role: user.role },
      dto,
    );
    return {
      message: transaction.status === 'APPROVED'
        ? 'Transaction fully approved and queued for processing'
        : 'Approval recorded',
      approvalId: approval.id,
      transactionId: transaction.id,
      transactionStatus: transaction.status,
      currentApprovals: transaction.currentApprovals,
      requiredApprovals: transaction.requiredApprovals,
      decision: approval.decision,
      timestamp: approval.timestamp,
    };
  }

  @Post(':id/reject')
  @Roles('admin', 'compliance_officer', 'finance_manager')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending high-value transaction' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiResponse({ status: 200, description: 'Transaction rejected successfully' })
  @ApiResponse({ status: 400, description: 'Transaction not pending or already actioned' })
  @ApiResponse({ status: 403, description: 'Insufficient role or self-rejection attempt' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectTransactionDto,
    @CurrentUser() user: { id: string; email: string; role: string },
  ) {
    const { transaction, approval } = await this.approvalService.rejectTransaction(
      id,
      { id: user.id, email: user.email, role: user.role },
      dto,
    );
    return {
      message: 'Transaction rejected',
      approvalId: approval.id,
      transactionId: transaction.id,
      transactionStatus: transaction.status,
      rejectionReason: transaction.rejectionReason,
      decision: approval.decision,
      timestamp: approval.timestamp,
    };
  }

  @Get(':id/approvals')
  @Roles('admin', 'compliance_officer', 'finance_manager')
  @ApiOperation({ summary: 'Get full approval history for a transaction' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiResponse({ status: 200, description: 'List of approval actions with decision and timestamp' })
  async getApprovals(@Param('id', ParseUUIDPipe) id: string) {
    const approvals = await this.approvalService.getApprovals(id);
    return { transactionId: id, approvals };
  }

  @Get('pending-approvals')
  @Roles('admin', 'compliance_officer', 'finance_manager')
  @ApiOperation({ summary: 'Get all transactions pending multi-sig approval' })
  @ApiResponse({ status: 200, description: 'List of pending approval transactions' })
  async getPendingApprovals() {
    const transactions = await this.approvalService.getPendingApprovalTransactions();
    return { count: transactions.length, transactions };
  }

  @Post('admin/:id/force-approve')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin force-approve bypassing quorum (audit-logged with reason)' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiBody({ type: ForceApproveDto })
  @ApiResponse({ status: 200, description: 'Transaction force-approved' })
  @ApiResponse({ status: 400, description: 'Transaction not in PENDING_APPROVAL state' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async forceApprove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ForceApproveDto,
    @CurrentUser() user: { id: string; email: string; role: string },
  ) {
    const transaction = await this.approvalService.adminForceApprove(
      id,
      { id: user.id, email: user.email, role: user.role },
      dto.reason,
    );
    return {
      message: 'Transaction force-approved by admin',
      transactionId: transaction.id,
      transactionStatus: transaction.status,
    };
  }
}
