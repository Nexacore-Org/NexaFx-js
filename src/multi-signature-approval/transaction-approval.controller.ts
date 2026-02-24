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
} from '@nestjs/swagger';
import { TransactionApprovalService } from './transaction-approval.service';
import { ApproveTransactionDto, RejectTransactionDto } from '../dto/approval.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

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
      message: `Transaction ${transaction.status === 'APPROVED' ? 'fully approved and queued for processing' : 'approval recorded'}`,
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
  @ApiOperation({ summary: 'Get all approval actions for a transaction' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiResponse({ status: 200, description: 'List of approval actions' })
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
}
