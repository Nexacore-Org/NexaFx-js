import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrencyPair } from './entities/currency-pair.entity';
import { UpsertCurrencyPairDto } from './dto/upsert-currency-pair.dto';
import { CurrenciesService } from '../currencies/currencies.service';

@Injectable()
export class CurrencyPairService {
  constructor(
    @InjectRepository(CurrencyPair)
    private readonly pairRepo: Repository<CurrencyPair>,
    private readonly currenciesService: CurrenciesService,
  ) {}

  async validatePair(fromCurrency: string, toCurrency: string): Promise<CurrencyPair> {
    this.currenciesService.validateCurrencyActive(fromCurrency);
    this.currenciesService.validateCurrencyActive(toCurrency);

    const pair = await this.pairRepo.findOne({ where: { fromCurrency, toCurrency, isActive: true } });
    if (!pair) {
      throw new BadRequestException(`Currency pair ${fromCurrency}/${toCurrency} not found or inactive`);
    }
    return pair;
  }

  async upsert(dto: UpsertCurrencyPairDto): Promise<CurrencyPair> {
    if (dto.spreadPercent > 5) {
      throw new BadRequestException('Spread cannot exceed 5%');
    }
    let pair = await this.pairRepo.findOne({ where: { fromCurrency: dto.fromCurrency, toCurrency: dto.toCurrency } });
    if (pair) {
      Object.assign(pair, dto);
    } else {
      pair = this.pairRepo.create(dto);
    }
    return this.pairRepo.save(pair);
  }

  async findAll(): Promise<CurrencyPair[]> {
    return this.pairRepo.find();
  }
}
