import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RiskScoringService } from '../services/risk-scoring.service';
import {
  EvaluateRiskDto,
  ReviewFlaggedTransactionDto,
  SearchFlaggedTransactionsDto,
  RiskLevel,
  ReviewStatus,
} from '../dto/risk-evaluation.dto';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';

@Controller('admin/risk')
@UseGuards(AdminGuard)
export class RiskScoringAdminController {
  constructor(private readonly riskScoringService: RiskScoringService) {}

  /**
   * Get all flagged transactions for admin review
   */
  @Get('flagged')
  async getFlaggedTransactions(@Query() query: SearchFlaggedTransactionsDto) {
    const { items, total } = await this.riskScoringService.getFlaggedTransactions({
      riskLevel: query.riskLevel,
      reviewStatus: query.reviewStatus,
      minRiskScore: query.minRiskScore,
      maxRiskScore: query.maxRiskScore,
      page: query.page,
      limit: query.limit,
    });

    return {
      success: true,
      data: items.map((risk) => ({
        id: risk.id,
        transactionId: risk.transactionId,
        riskScore: risk.riskScore,
        riskLevel: risk.riskLevel,
        flagReason: risk.flagReason,
        reviewStatus: risk.reviewStatus,
        createdAt: risk.createdAt,
        flaggedAt: risk.flaggedAt,
        riskFactors: risk.riskFactors,
        velocityData: risk.velocityData,
        deviceContext: risk.deviceContext,
        transaction: risk.transaction
          ? {
              id: risk.transaction.id,
              amount: risk.transaction.amount,
              currency: risk.transaction.currency,
              status: risk.transaction.status,
              description: risk.transaction.description,
              createdAt: risk.transaction.createdAt,
            }
          : null,
      })),
      meta: {
        page: query.page || 1,
        limit: query.limit || 20,
        total,
        totalPages: Math.ceil(total / (query.limit || 20)),
      },
    };
  }

  /**
   * Get risk statistics for dashboard
   */
  @Get('statistics')
  async getRiskStatistics() {
    const stats = await this.riskScoringService.getRiskStatistics();

    return {
      success: true,
      data: stats,
    };
  }

  /**
   * Get details of a specific flagged transaction
   */
  @Get('flagged/:id')
  async getFlaggedTransactionDetails(@Param('id', new ParseUUIDPipe()) id: string) {
    const { items } = await this.riskScoringService.getFlaggedTransactions({
      page: 1,
      limit: 1,
    });

    const risk = items.find((r) => r.id === id);

    if (!risk) {
      return {
        success: false,
        message: 'Flagged transaction not found',
      };
    }

    return {
      success: true,
      data: {
        id: risk.id,
        transactionId: risk.transactionId,
        riskScore: risk.riskScore,
        riskLevel: risk.riskLevel,
        isFlagged: risk.isFlagged,
        flagReason: risk.flagReason,
        reviewStatus: risk.reviewStatus,
        adminNotes: risk.adminNotes,
        createdAt: risk.createdAt,
        flaggedAt: risk.flaggedAt,
        reviewedAt: risk.reviewedAt,
        reviewedBy: risk.reviewedBy,
        riskFactors: risk.riskFactors,
        evaluationHistory: risk.evaluationHistory,
        velocityData: risk.velocityData,
        deviceContext: risk.deviceContext,
        transaction: risk.transaction
          ? {
              id: risk.transaction.id,
              amount: risk.transaction.amount,
              currency: risk.transaction.currency,
              status: risk.transaction.status,
              description: risk.transaction.description,
              metadata: risk.transaction.metadata,
              createdAt: risk.transaction.createdAt,
              updatedAt: risk.transaction.updatedAt,
            }
          : null,
      },
    };
  }

  /**
   * Review a flagged transaction
   */
  @Post('flagged/:id/review')
  @HttpCode(HttpStatus.OK)
  async reviewFlaggedTransaction(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReviewFlaggedTransactionDto,
    @Request() req: any,
  ) {
    const adminId = req.user?.id;

    if (!adminId) {
      return {
        success: false,
        message: 'Admin ID not found in request',
      };
    }

    const updated = await this.riskScoringService.reviewFlaggedTransaction(
      id,
      adminId,
      body.reviewStatus,
      body.adminNotes,
      body.allowAutoProcessing,
    );

    return {
      success: true,
      data: {
        id: updated.id,
        reviewStatus: updated.reviewStatus,
        reviewedAt: updated.reviewedAt,
        reviewedBy: updated.reviewedBy,
        adminNotes: updated.adminNotes,
      },
      message: `Transaction review status updated to ${body.reviewStatus}`,
    };
  }

  /**
   * Manually trigger risk evaluation for a transaction
   */
  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  async evaluateRisk(@Body() body: EvaluateRiskDto) {
    const result = await this.riskScoringService.evaluateRisk(
      body.transactionId,
      body.userId,
      body.deviceId,
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Bulk approve multiple flagged transactions
   */
  @Post('flagged/bulk-approve')
  @HttpCode(HttpStatus.OK)
  async bulkApprove(
    @Body() body: { ids: string[] },
    @Request() req: any,
  ) {
    const adminId = req.user?.id;

    if (!adminId) {
      return {
        success: false,
        message: 'Admin ID not found in request',
      };
    }

    const results = await Promise.all(
      body.ids.map(async (id) => {
        try {
          await this.riskScoringService.reviewFlaggedTransaction(
            id,
            adminId,
            ReviewStatus.APPROVED,
            'Bulk approval',
            true,
          );
          return { id, success: true };
        } catch (error) {
          return { id, success: false, error: error.message };
        }
      }),
    );

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    return {
      success: true,
      data: {
        totalProcessed: results.length,
        successful: successful.length,
        failed: failed.length,
        details: results,
      },
    };
  }
}

/**
 * Public controller for risk-related endpoints
 */
@Controller('risk')
@UseGuards(JwtAuthGuard)
export class RiskScoringController {
  constructor(private readonly riskScoringService: RiskScoringService) {}

  /**
   * Check if a transaction can be auto-processed
   */
  @Get('can-process/:transactionId')
  async canAutoProcess(@Param('transactionId', new ParseUUIDPipe()) transactionId: string) {
    const canProcess = await this.riskScoringService.canAutoProcess(transactionId);

    return {
      success: true,
      data: {
        transactionId,
        canAutoProcess: canProcess,
      },
    };
  }
}
