import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from './entities/currency.entity';
import { AddCurrencyDto, UpdateCurrencyDto } from './dto/currency.dto';

@Injectable()
export class CurrenciesService {
  constructor(
    @InjectRepository(Currency)
    private readonly repo: Repository<Currency>,
  ) {}

  async getSupported() {
    return this.repo.find({ where: { enabled: true } });
  }

  async getDetails(code: string) {
    const c = await this.repo.findOne({ where: { code: code.toUpperCase() } });
    if (!c) throw new NotFoundException('Currency not found');
    return c;
  }

  async addCurrency(body: AddCurrencyDto) {
    const created = this.repo.create({
      code: body.code.toUpperCase(),
      name: body.name,
      decimals: body.decimals ?? 2,
      enabled: true,
    });
    return this.repo.save(created);
  }

  async updateCurrency(code: string, body: UpdateCurrencyDto) {
    const c = await this.repo.findOne({ where: { code: code.toUpperCase() } });
    if (!c) throw new NotFoundException('Currency not found');
    if (body.name !== undefined) c.name = body.name;
    if (body.decimals !== undefined) c.decimals = body.decimals;
    if (body.enabled !== undefined) c.enabled = body.enabled;
    return this.repo.save(c);
  }

  async setEnabled(code: string, enabled: boolean) {
    const c = await this.repo.findOne({ where: { code: code.toUpperCase() } });
    if (!c) throw new NotFoundException('Currency not found');
    c.enabled = enabled;
    return this.repo.save(c);
  }

  async getVolumes() {
    // Placeholder: return empty volumes; wire to analytics later
    return [];
  }

  async getLiquidity() {
    // Placeholder: return empty liquidity snapshot
    return [];
  }
}


