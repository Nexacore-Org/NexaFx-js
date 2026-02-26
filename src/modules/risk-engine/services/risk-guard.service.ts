import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiskState } from '../entities/risk-state.entity';
import { RiskPosition } from '../entities/risk-position.entity';
import { RiskCalculationService } from './risk-calculation.service';
import { TradeRequestDto, RiskCheckResult } from '../dto/risk-check.dto';

@Injectable()
export class RiskGuardService {
  private readonly logger = new Logger(RiskGuardService.name);

  constructor(
    @InjectRepository(RiskState)
    private readonly riskStateRepo: Repository<RiskState>,
    @InjectRepository(RiskPosition)
    private readonly positionRepo: Repository<RiskPosition>,
    private readonly riskCalc: RiskCalculationService,
  ) {}

  async checkTradeRisk(trade: TradeRequestDto): Promise<RiskCheckResult> {
    const riskState = await this.riskStateRepo.findOne({
      where: { userId: trade.userId },
    });

    if (!riskState) {
      // If no risk profile exists, we might default to blocking or creating one.
      // For safety, block.
      return { isAllowed: false, reason: 'Risk profile not found' };
    }

    const limits = riskState.limits || {};
    const currentPositions = await this.positionRepo.find({
      where: { userId: trade.userId },
    });

    // 1. Check Restricted Symbols
    if (
      limits.restrictedSymbols &&
      limits.restrictedSymbols.includes(trade.symbol)
    ) {
      return {
        isAllowed: false,
        reason: `Symbol ${trade.symbol} is restricted`,
      };
    }

    // 2. Check Max Position Size
    const tradeValue = trade.quantity * trade.price;
    if (limits.maxPositionSize && tradeValue > limits.maxPositionSize) {
      return {
        isAllowed: false,
        reason: `Trade value ${tradeValue} exceeds max position size ${limits.maxPositionSize}`,
      };
    }

    // Simulate New Portfolio
    const newPosition: RiskPosition = {
      id: 'simulated',
      userId: trade.userId,
      symbol: trade.symbol,
      quantity: trade.quantity,
      entryPrice: trade.price,
      currentPrice: trade.price,
      leverage: trade.leverage,
      side: trade.side,
      assetType: trade.assetType,
      riskState: riskState,
    };

    const simulatedPositions = [...currentPositions, newPosition];

    // 3. Check Max Leverage
    const totalExposure =
      this.riskCalc.calculateTotalExposure(simulatedPositions);
    const projectedLeverage = totalExposure / (riskState.totalEquity || 1); // Avoid div by zero

    if (limits.maxLeverage && projectedLeverage > limits.maxLeverage) {
      return {
        isAllowed: false,
        reason: `Projected leverage ${projectedLeverage.toFixed(2)} exceeds limit ${limits.maxLeverage}`,
        currentMetrics: {
          leverage: projectedLeverage,
          marginUtilization: 0,
          projectedDrawdown: 0,
        },
      };
    }

    // 4. Check Margin Utilization
    const usedMargin = this.riskCalc.calculateUsedMargin(simulatedPositions);
    const marginUtilization = usedMargin / (riskState.totalEquity || 1);

    if (marginUtilization > 0.9) {
      // Hard limit at 90% margin
      return {
        isAllowed: false,
        reason: `Projected margin utilization ${marginUtilization.toFixed(2)} exceeds 90% safety threshold`,
        currentMetrics: {
          leverage: projectedLeverage,
          marginUtilization,
          projectedDrawdown: 0,
        },
      };
    }

    // 5. Check VaR Limit (if configured)
    // const projectedVaR = this.riskCalc.calculateVaR(simulatedPositions);
    // if (limits.maxVaR && projectedVaR > limits.maxVaR) { ... }

    return {
      isAllowed: true,
      currentMetrics: {
        leverage: projectedLeverage,
        marginUtilization,
        projectedDrawdown: 0,
      },
    };
  }
}
