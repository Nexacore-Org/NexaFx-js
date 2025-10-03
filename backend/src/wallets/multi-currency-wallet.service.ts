import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletBalance } from './entities/wallet-balance.entity';

@Injectable()
export class MultiCurrencyWalletService {
  constructor(
    @InjectRepository(WalletBalance)
    private readonly walletRepo: Repository<WalletBalance>,
  ) {}

  async getBalances(userId: string) {
    return this.walletRepo.find({ where: { userId } });
  }
}


