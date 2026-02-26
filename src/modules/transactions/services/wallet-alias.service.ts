import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletAliasEntity } from '../entities/wallet-alias.entity';
import { CreateWalletAliasDto } from '../dto/create-wallet-alias.dto';
import { UpdateWalletAliasDto } from '../dto/update-wallet-alias.dto';

@Injectable()
export class WalletAliasService {
  constructor(
    @InjectRepository(WalletAliasEntity)
    private readonly walletAliasRepo: Repository<WalletAliasEntity>,
  ) {}

  async create(userId: string, dto: CreateWalletAliasDto): Promise<WalletAliasEntity> {
    // Check if alias already exists for this user + wallet combination
    const existing = await this.walletAliasRepo.findOne({
      where: {
        userId,
        walletAddress: dto.walletAddress,
      },
    });

    if (existing) {
      throw new ConflictException('Alias already exists for this wallet address');
    }

    const walletAlias = this.walletAliasRepo.create({
      userId,
      walletAddress: dto.walletAddress,
      alias: dto.alias,
      metadata: dto.metadata,
    });

    return await this.walletAliasRepo.save(walletAlias);
  }

  async findAllByUser(userId: string): Promise<WalletAliasEntity[]> {
    return await this.walletAliasRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByUserAndWallet(userId: string, walletAddress: string): Promise<WalletAliasEntity | null> {
    return await this.walletAliasRepo.findOne({
      where: {
        userId,
        walletAddress,
      },
    });
  }

  async update(id: string, userId: string, dto: UpdateWalletAliasDto): Promise<WalletAliasEntity> {
    const walletAlias = await this.walletAliasRepo.findOne({
      where: { id, userId },
    });

    if (!walletAlias) {
      throw new NotFoundException('Wallet alias not found');
    }

    if (dto.alias !== undefined) {
      walletAlias.alias = dto.alias;
    }

    if (dto.metadata !== undefined) {
      walletAlias.metadata = dto.metadata;
    }

    return await this.walletAliasRepo.save(walletAlias);
  }

  async delete(id: string, userId: string): Promise<void> {
    const result = await this.walletAliasRepo.delete({
      id,
      userId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Wallet alias not found');
    }
  }

  async getWalletAliasMap(userId: string): Promise<Map<string, string>> {
    const aliases = await this.findAllByUser(userId);
    const aliasMap = new Map<string, string>();
    
    aliases.forEach(alias => {
      aliasMap.set(alias.walletAddress, alias.alias);
    });

    return aliasMap;
  }
}