import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { WalletEntity } from './entities/wallet.entity';
import { UserEntity } from './entities/user.entity';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { CreateAdminAuditLogDto } from '../admin-audit/dto/create-admin-audit-log.dto';
import { ActorType } from '../admin-audit/entities/admin-audit-log.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepository: Repository<WalletEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  /**
   * Creates a new wallet with collision handling for public key uniqueness
   */
  async createWallet(userId: string, walletData: Partial<WalletEntity>): Promise<WalletEntity> {
    // Verify user exists and is not deleted
    const user = await this.userRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });

    if (!user) {
      throw new NotFoundException('User not found or has been deleted');
    }

    // Check if wallet with public key already exists (collision check)
    const existingWallet = await this.walletRepository.findOne({
      where: { publicKey: walletData.publicKey },
    });

    if (existingWallet) {
      throw new ConflictException('Wallet with this public key already exists');
    }

    // Create the wallet
    const wallet = this.walletRepository.create({
      ...walletData,
      userId,
    });

    try {
      return await this.walletRepository.save(wallet);
    } catch (error) {
      // Handle unique constraint violation at database level
      if (error.code === '23505') { // PostgreSQL unique violation code
        throw new ConflictException('Wallet with this public key already exists');
      }
      throw error;
    }
  }

  /**
   * Updates a wallet with collision handling for public key uniqueness
   */
  async updateWallet(walletId: string, updateData: Partial<WalletEntity>): Promise<WalletEntity> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // If updating public key, check for collisions
    if (updateData.publicKey && updateData.publicKey !== wallet.publicKey) {
      const existingWallet = await this.walletRepository.findOne({
        where: { publicKey: updateData.publicKey },
      });

      if (existingWallet) {
        throw new ConflictException('Another wallet with this public key already exists');
      }
    }

    // Update the wallet
    Object.assign(wallet, updateData);

    try {
      return await this.walletRepository.save(wallet);
    } catch (error) {
      // Handle unique constraint violation at database level
      if (error.code === '23505') { // PostgreSQL unique violation code
        throw new ConflictException('Another wallet with this public key already exists');
      }
      throw error;
    }
  }

  /**
   * Gets all wallets for a user (excluding soft deleted)
   */
  async getWalletsByUser(userId: string): Promise<WalletEntity[]> {
    return await this.walletRepository.find({
      where: { userId, deletedAt: IsNull() },
    });
  }

  /**
   * Gets a specific wallet by ID (excluding soft deleted)
   */
  async getWalletById(walletId: string): Promise<WalletEntity> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId, deletedAt: IsNull() },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  /**
   * Performs a soft delete on a wallet
   */
  async softDeleteWallet(walletId: string, actorId?: string, actorType?: ActorType): Promise<void> {
    const wallet = await this.getWalletById(walletId);
    
    await this.walletRepository.softRemove(wallet);
    
    // Log the soft delete action
    try {
      const auditLogDto = new CreateAdminAuditLogDto();
      auditLogDto.actorId = actorId || 'SYSTEM';
      auditLogDto.actorType = actorType || ActorType.SYSTEM;
      auditLogDto.entity = 'WALLET';
      auditLogDto.action = 'SOFT_DELETE';
      auditLogDto.entityId = wallet.id;
      auditLogDto.metadata = {
        publicKey: wallet.publicKey,
        name: wallet.name,
        userId: wallet.userId,
        deletedAt: new Date(),
      };
      auditLogDto.description = `Wallet ${wallet.name} (${wallet.publicKey}) was soft deleted`;
      
      await this.adminAuditService.logAction(auditLogDto);
    } catch (error) {
      // If audit logging fails, we still want to complete the soft delete
      console.error('Failed to log wallet soft delete action:', error);
    }
  }

  /**
   * Restores a soft-deleted wallet
   */
  async restoreWallet(walletId: string): Promise<WalletEntity> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId },
      withDeleted: true,
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (!wallet.deletedAt) {
      throw new ConflictException('Wallet is not soft deleted');
    }

    // Restore the wallet
    (wallet as any).deletedAt = null;
    return await this.walletRepository.save(wallet);
  }

  /**
   * Checks if a wallet public key already exists (for collision detection)
   */
  async checkPublicKeyExists(publicKey: string, excludeWalletId?: string): Promise<boolean> {
    const whereCondition: any = { publicKey };
    
    if (excludeWalletId) {
      whereCondition.id = () => `<> '${excludeWalletId}'`;
    }

    const existingWallet = await this.walletRepository.findOne({
      where: whereCondition,
    });

    return !!existingWallet;
  }
}
