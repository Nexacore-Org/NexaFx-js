import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';

import { Wallet } from '../entities/wallet.entity';
import { WalletEncryptionService } from './wallet-encryption.service';
import { CreateWalletDto, UpdateWalletPrivateKeyDto } from '../dto/create-wallet.dto';
import { WalletResponseDto } from '../dto/wallet-response.dto';

@Injectable()
export class WalletService {
  /**
   * Never log the word "privateKey" alongside any actual value.
   * All private key material is redacted before it reaches the logger.
   */
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly encryptionService: WalletEncryptionService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // CRUD
  // ──────────────────────────────────────────────────────────────────────────

  async create(dto: CreateWalletDto): Promise<WalletResponseDto> {
    let encryptedKey: string;

    try {
      encryptedKey = this.encryptionService.encrypt(dto.privateKey);
    } catch {
      // Don't let the original exception surface — it might carry key material
      throw new InternalServerErrorException('Failed to secure wallet key.');
    }

    const wallet = this.walletRepository.create({
      address: dto.address,
      network: dto.network,
      userId: dto.userId,
      privateKeyEncrypted: encryptedKey,
      keyVersion: 1,
    });

    const saved = await this.walletRepository.save(wallet);
    this.logger.log(`Wallet created — id=${saved.id} address=${saved.address}`);

    return this.toResponse(saved);
  }

  async findAll(): Promise<WalletResponseDto[]> {
    const wallets = await this.walletRepository.find();
    return wallets.map((w) => this.toResponse(w));
  }

  async findById(id: string): Promise<WalletResponseDto> {
    const wallet = await this.walletRepository.findOne({ where: { id } });
    if (!wallet) throw new NotFoundException(`Wallet ${id} not found.`);
    return this.toResponse(wallet);
  }

  async updatePrivateKey(
    id: string,
    dto: UpdateWalletPrivateKeyDto,
  ): Promise<WalletResponseDto> {
    const wallet = await this.findRawOrFail(id);

    try {
      wallet.privateKeyEncrypted = this.encryptionService.encrypt(dto.privateKey);
      wallet.keyVersion += 1;
    } catch {
      throw new InternalServerErrorException('Failed to secure wallet key.');
    }

    const saved = await this.walletRepository.save(wallet);
    this.logger.log(`Wallet key updated — id=${id} keyVersion=${saved.keyVersion}`);

    return this.toResponse(saved);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Decryption (internal use only — e.g., for signing transactions)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Retrieve and decrypt the private key for internal crypto operations.
   * NEVER return the result to an API caller.
   */
  async getDecryptedPrivateKey(id: string): Promise<string> {
    const wallet = await this.findRawOrFail(id);

    try {
      return this.encryptionService.decrypt(wallet.privateKeyEncrypted);
    } catch {
      // Do NOT expose wallet id or any key material in the thrown error message
      throw new InternalServerErrorException('Unable to access wallet key material.');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────────────────

  /** Load the full entity (including encrypted key) — for internal use only. */
  async findRawOrFail(id: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({ where: { id } });
    if (!wallet) throw new NotFoundException(`Wallet ${id} not found.`);
    return wallet;
  }

  /**
   * Strip the encrypted key before returning to any consumer.
   * Uses class-transformer @Exclude / @Expose decorators on WalletResponseDto.
   */
  private toResponse(wallet: Wallet): WalletResponseDto {
    return plainToInstance(WalletResponseDto, wallet, {
      excludeExtraneousValues: true,
    });
  }
}
