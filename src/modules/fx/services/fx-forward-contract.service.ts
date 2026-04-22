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
import { FxForwardContract, ForwardContractStatus } from '../entities/fx-forward-contract.entity';
import { FxExposureService } from './fx-exposure.service';

export interface CreateForwardDto {
  baseCurrency: string;
  quoteCurrency: string;
  notionalAmount: number;
  maturityDate: string;
  collateralCurrency?: string;
  collateralAmount?: number;
}

@Injectable()
export class FxForwardContractService {
  private readonly logger = new Logger(FxForwardContractService.name);
  private readonly cancellationFeeRate: number;
  private readonly minCollateralRate: number;
  private readonly riskThreshold: number;

  constructor(
    @InjectRepository(FxForwardContract)
    private readonly repo: Repository<FxForwardContract>,
    private readonly exposureService: FxExposureService,
    private readonly config: ConfigService,
  ) {
    this.cancellationFeeRate = Number(config.get('FORWARD_CANCELLATION_FEE_RATE') ?? '0.02');
    this.minCollateralRate = Number(config.get('FORWARD_MIN_COLLATERAL_RATE') ?? '0.10');
    this.riskThreshold = Number(config.get('FORWARD_RISK_THRESHOLD') ?? '1000000');
  }

  /**
   * POST /fx/forwards — lock rate, validate collateral, create ACTIVE contract.
   * In production, getCurrentRate() should call the real FX aggregator.
   */
  async book(userId: string, dto: CreateForwardDto): Promise<FxForwardContract> {
    const maturityDate = new Date(dto.maturityDate);
    if (maturityDate <= new Date()) {
      throw new BadRequestException('Maturity date must be in the future');
    }

    // Stub rate — replace with real FX aggregator call
    const lockedRate = await this.getCurrentRate(dto.baseCurrency, dto.quoteCurrency);

    const collateralCurrency = dto.collateralCurrency ?? dto.baseCurrency;
    const minCollateral = dto.notionalAmount * this.minCollateralRate;
    const collateralAmount = dto.collateralAmount ?? minCollateral;

    if (collateralAmount < minCollateral) {
      throw new BadRequestException(
        `Minimum collateral is ${minCollateral} ${collateralCurrency}`,
      );
    }

    // TODO: block collateralAmount in user's wallet

    const contract = this.repo.create({
      userId,
      baseCurrency: dto.baseCurrency,
      quoteCurrency: dto.quoteCurrency,
      lockedRate,
      notionalAmount: dto.notionalAmount,
      collateralAmount,
      collateralCurrency,
      maturityDate,
      status: ForwardContractStatus.ACTIVE,
    });

    const saved = await this.repo.save(contract);

    // Update exposure and check risk threshold
    await this.exposureService.addExposure(
      dto.baseCurrency,
      dto.quoteCurrency,
      dto.notionalAmount,
    );

    return saved;
  }

  /** GET /fx/forwards — list user's active and settled contracts */
  async listForUser(userId: string): Promise<FxForwardContract[]> {
    return this.repo.find({
      where: [
        { userId, status: ForwardContractStatus.ACTIVE },
        { userId, status: ForwardContractStatus.SETTLED },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  /** Cancel a contract early, charging the cancellation fee */
  async cancel(userId: string, contractId: string): Promise<FxForwardContract> {
    const contract = await this.repo.findOne({ where: { id: contractId } });
    if (!contract) throw new NotFoundException(`Contract ${contractId} not found`);
    if (contract.userId !== userId) throw new ForbiddenException();
    if (contract.status !== ForwardContractStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE contracts can be cancelled');
    }

    const fee = Number(contract.notionalAmount) * this.cancellationFeeRate;
    contract.status = ForwardContractStatus.CANCELLED;
    contract.cancellationFeeCharged = fee;
    contract.closedAt = new Date();

    // TODO: release collateral minus fee from user's wallet

    await this.exposureService.removeExposure(
      contract.baseCurrency,
      contract.quoteCurrency,
      Number(contract.notionalAmount),
    );

    return this.repo.save(contract);
  }

  /** Settle a single contract at its locked rate */
  async settle(contract: FxForwardContract): Promise<FxForwardContract> {
    contract.status = ForwardContractStatus.SETTLED;
    contract.settlementRate = contract.lockedRate;
    contract.closedAt = new Date();

    // TODO: execute the FX conversion at lockedRate and release collateral

    await this.exposureService.removeExposure(
      contract.baseCurrency,
      contract.quoteCurrency,
      Number(contract.notionalAmount),
    );

    return this.repo.save(contract);
  }

  /** Find all ACTIVE contracts whose maturity date has passed */
  async findDueContracts(): Promise<FxForwardContract[]> {
    return this.repo.find({
      where: { status: ForwardContractStatus.ACTIVE, maturityDate: LessThanOrEqual(new Date()) },
    });
  }

  /** Stub — replace with real FX aggregator */
  private async getCurrentRate(base: string, quote: string): Promise<number> {
    // TODO: inject and call FxAggregatorService
    return 1.0;
  }
}
