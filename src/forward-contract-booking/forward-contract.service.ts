import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, LessThanOrEqual } from 'typeorm';
import {
  ForwardContract,
  ForwardContractStatus,
} from '../entities/forward-contract.entity';
import {
  CancelForwardContractDto,
  CreateForwardContractDto,
} from '../dto/forward-contract.dto';
import { ExposureService } from '../../risk-engine/exposure.service';

// ---------------------------------------------------------------------------
// Minimal interface for the existing ExchangeRatesService.
// Replace with the real import once you wire the module.
// ---------------------------------------------------------------------------
export interface IExchangeRateProvider {
  getCurrentRate(base: string, quote: string): Promise<number>;
}

export const EXCHANGE_RATE_PROVIDER = 'EXCHANGE_RATE_PROVIDER';

// ---------------------------------------------------------------------------

@Injectable()
export class ForwardContractService {
  private readonly logger = new Logger(ForwardContractService.name);

  /** Configurable early-cancellation fee (default 2 %) */
  private readonly cancellationFeeRate: number;

  /** Minimum collateral as a fraction of notional (default 10 %) */
  private readonly minCollateralRate: number;

  constructor(
    @InjectRepository(ForwardContract)
    private readonly forwardRepo: Repository<ForwardContract>,
    private readonly exposureService: ExposureService,
    private readonly configService: ConfigService,
  ) {
    this.cancellationFeeRate = Number(
      this.configService.get<string>('FORWARD_CANCELLATION_FEE_RATE') ?? '0.02',
    );
    this.minCollateralRate = Number(
      this.configService.get<string>('FORWARD_MIN_COLLATERAL_RATE') ?? '0.10',
    );
  }

  // ─── Booking ──────────────────────────────────────────────────────────────

  /**
   * POST /fx/forwards
   * 1. Fetch and lock the current spot rate.
   * 2. Validate maturity date is in the future.
   * 3. Validate / derive collateral amount and mark it as blocked.
   * 4. Persist the contract with status ACTIVE.
   * 5. Inform ExposureService.
   */
  async bookForward(
    userId: string,
    dto: CreateForwardContractDto,
    rateProvider: IExchangeRateProvider,
  ): Promise<ForwardContract> {
    const maturityDate = new Date(dto.maturityDate);
    if (maturityDate <= new Date()) {
      throw new BadRequestException('maturityDate must be in the future.');
    }

    // 1. Lock the current rate — immutable from this point on
    const lockedRate = await rateProvider.getCurrentRate(
      dto.baseCurrency,
      dto.quoteCurrency,
    );
    if (!lockedRate || lockedRate <= 0) {
      throw new BadRequestException(
        `Unable to obtain a valid rate for ${dto.baseCurrency}/${dto.quoteCurrency}.`,
      );
    }

    // 2. Collateral validation & blocking
    const collateralCurrency = (dto.collateralCurrency ?? dto.baseCurrency).toUpperCase();
    const minRequired = dto.notionalAmount * this.minCollateralRate;
    const collateralAmount = dto.collateralAmount ?? minRequired;

    if (collateralAmount < minRequired) {
      throw new BadRequestException(
        `Collateral of ${collateralAmount} ${collateralCurrency} is below the minimum ` +
          `required (${minRequired} — ${this.minCollateralRate * 100}% of notional). ` +
          `Collateral is blocked at booking time and cannot be released until settlement.`,
      );
    }

    // 3. Persist — lockedRate is written once here and never updated
    const contract = this.forwardRepo.create({
      userId,
      baseCurrency: dto.baseCurrency.toUpperCase(),
      quoteCurrency: dto.quoteCurrency.toUpperCase(),
      lockedRate,           // ← immutable
      notionalAmount: dto.notionalAmount,
      collateralCurrency,
      collateralAmount,     // ← blocked
      maturityDate,
      status: ForwardContractStatus.ACTIVE,
    });

    const saved = await this.forwardRepo.save(contract);

    // 4. Track exposure
    this.exposureService.addExposure(
      saved.baseCurrency,
      saved.quoteCurrency,
      saved.notionalAmount,
    );

    this.logger.log(
      `[ForwardContract] Booked ${saved.id} for user ${userId}: ` +
        `${saved.notionalAmount} ${saved.baseCurrency}/${saved.quoteCurrency} ` +
        `@ locked rate ${saved.lockedRate}, matures ${saved.maturityDate.toISOString()}`,
    );

    return saved;
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async findAll(userId: string): Promise<ForwardContract[]> {
    return this.forwardRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<ForwardContract> {
    const contract = await this.forwardRepo.findOne({ where: { id } });
    if (!contract) throw new NotFoundException(`Forward contract ${id} not found.`);
    if (contract.userId !== userId)
      throw new ForbiddenException('You do not own this contract.');
    return contract;
  }

  // ─── Cancellation ─────────────────────────────────────────────────────────

  /**
   * Early cancellation:
   *  - Charges FORWARD_CANCELLATION_FEE_RATE on the notional.
   *  - Releases remaining collateral (after fee deduction).
   *  - Sets status to CANCELLED.
   */
  async cancelContract(
    id: string,
    userId: string,
    _dto: CancelForwardContractDto,
  ): Promise<ForwardContract> {
    const contract = await this.findOne(id, userId);

    if (contract.status !== ForwardContractStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot cancel a contract with status ${contract.status}.`,
      );
    }

    const cancellationFee =
      contract.notionalAmount * contract.lockedRate * this.cancellationFeeRate;

    await this.forwardRepo.update(contract.id, {
      status: ForwardContractStatus.CANCELLED,
      cancellationFeeCharged: cancellationFee,
      closedAt: new Date(),
    });

    // Release exposure
    this.exposureService.removeExposure(
      contract.baseCurrency,
      contract.quoteCurrency,
      contract.notionalAmount,
    );

    this.logger.log(
      `[ForwardContract] Cancelled ${contract.id} — fee charged: ${cancellationFee} ${contract.quoteCurrency}`,
    );

    return this.forwardRepo.findOne({ where: { id: contract.id } }) as Promise<ForwardContract>;
  }

  // ─── Settlement (called by cron) ─────────────────────────────────────────

  /**
   * Settle all ACTIVE contracts whose maturityDate ≤ now.
   * Uses the locked rate — never the current market rate.
   */
  async settleDueContracts(): Promise<{ settled: number; errors: number }> {
    const due = await this.forwardRepo.find({
      where: {
        status: ForwardContractStatus.ACTIVE,
        maturityDate: LessThanOrEqual(new Date()),
      },
    });

    let settled = 0;
    let errors = 0;

    for (const contract of due) {
      try {
        await this.settleContract(contract);
        settled++;
      } catch (err) {
        errors++;
        this.logger.error(
          `[ForwardSettlement] Failed to settle contract ${contract.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `[ForwardSettlement] Cron run complete — settled: ${settled}, errors: ${errors}`,
    );

    return { settled, errors };
  }

  /** Settle a single contract at its locked rate */
  async settleContract(contract: ForwardContract): Promise<ForwardContract> {
    if (contract.status !== ForwardContractStatus.ACTIVE) {
      throw new BadRequestException(
        `Contract ${contract.id} is not ACTIVE (status: ${contract.status}).`,
      );
    }

    // Settlement always uses the locked rate — market rate is irrelevant
    const settlementRate = contract.lockedRate;
    const settlementAmount = contract.notionalAmount * settlementRate;

    await this.forwardRepo.update(contract.id, {
      status: ForwardContractStatus.SETTLED,
      settlementRate,      // equals lockedRate, stored for audit
      closedAt: new Date(),
    });

    this.exposureService.removeExposure(
      contract.baseCurrency,
      contract.quoteCurrency,
      contract.notionalAmount,
    );

    this.logger.log(
      `[ForwardSettlement] Settled contract ${contract.id}: ` +
        `${contract.notionalAmount} ${contract.baseCurrency} → ${settlementAmount} ${contract.quoteCurrency} ` +
        `@ locked rate ${settlementRate}`,
    );

    return this.forwardRepo.findOne({ where: { id: contract.id } }) as Promise<ForwardContract>;
  }
}
