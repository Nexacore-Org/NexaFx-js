import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { RiskGuardService } from '../../risk-engine/services/risk-guard.service';

@Injectable()
export class RiskPreTradeGuard implements CanActivate {
  private readonly logger = new Logger(RiskPreTradeGuard.name);

  constructor(private readonly riskGuardService: RiskGuardService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Expect userId from authenticated session/JWT
    const userId: string = (request as any).user?.id || (request as any).user?.sub;

    if (!userId) {
      throw new ForbiddenException('Unauthenticated request cannot pass risk gate.');
    }

    const tradeSize: number =
      request.body?.amount ?? request.body?.tradeSize ?? 0;

    const currencyPair: string =
      request.body?.currencyPair ?? request.body?.pair ?? 'UNKNOWN';

    const result = await this.riskGuardService.checkTradeRisk({
      userId,
      tradeSize,
      currencyPair,
    });

    if (!result.isAllowed) {
      this.logger.warn(
        `Risk gate blocked trade for user ${userId}: ${result.reason}`,
      );

      // Per spec: 403 with reason and currentMetrics
      throw new ForbiddenException({
        statusCode: 403,
        message: result.reason,
        reason: result.reason,
        currentMetrics: result.currentMetrics,
      });
    }

    return true;
  }
}