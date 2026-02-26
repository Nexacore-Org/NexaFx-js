import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, IsNull } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import { WalletEntity } from './entities/wallet.entity';
import { UserPreferenceEntity } from './entities/user-preference.entity';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';
import { WalletService } from './wallet.service';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { CreateAdminAuditLogDto } from '../admin-audit/dto/create-admin-audit-log.dto';
import { ActorType } from '../admin-audit/entities/admin-audit-log.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(UserPreferenceEntity)
    private readonly preferencesRepo: Repository<UserPreferenceEntity>,
    private readonly walletService: WalletService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  // User management methods
  async createUser(userData: Partial<UserEntity>): Promise<UserEntity> {
    // Check if user with email already exists (and is not soft deleted)
    const existingUser = await this.userRepository.findOne({
      where: { email: userData.email },
    });
    
    if (existingUser) {
      throw new Error('User with this email already exists');
    }
    
    const user = this.userRepository.create(userData);
    return await this.userRepository.save(user);
  }

  async findUserById(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { id },
      withDeleted: true, // Include soft deleted records
    });
    
    if (!user) {
      throw new NotFoundException('User not found');
    }
    
    return user;
  }

  async findActiveUserById(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { id, deletedAt: IsNull() }, // Only active users
    });
    
    if (!user) {
      throw new NotFoundException('Active user not found');
    }
    
    return user;
  }

  async findUserByEmail(email: string): Promise<UserEntity | null> {
    return await this.userRepository.findOne({
      where: { email },
      withDeleted: true, // Include soft deleted records
    });
  }

  async findActiveUserByEmail(email: string): Promise<UserEntity | null> {
    return await this.userRepository.findOne({
      where: { email, deletedAt: IsNull() }, // Only active users
    });
  }

  async softDeleteUser(id: string, actorId?: string, actorType?: ActorType): Promise<void> {
    const user = await this.findUserById(id);
    
    if (user.deletedAt) {
      // Already soft deleted
      return;
    }
    
    // Perform soft delete
    await this.userRepository.softRemove(user);
    
    // Log the soft delete action
    try {
      const auditLogDto = new CreateAdminAuditLogDto();
      auditLogDto.actorId = actorId || 'SYSTEM';
      auditLogDto.actorType = actorType || ActorType.SYSTEM;
      auditLogDto.entity = 'USER';
      auditLogDto.action = 'SOFT_DELETE';
      auditLogDto.entityId = user.id;
      auditLogDto.metadata = {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        deletedAt: new Date(),
      };
      auditLogDto.description = `User ${user.email} was soft deleted`;
      
      await this.adminAuditService.logAction(auditLogDto);
    } catch (error) {
      // If audit logging fails, we still want to complete the soft delete
      console.error('Failed to log soft delete action:', error);
    }
  }

  async restoreUser(id: string): Promise<UserEntity> {
    const user = await this.findUserById(id);
    
    if (!user.deletedAt) {
      throw new Error('User is not soft deleted');
    }
    
    // Restore the user
    (user as any).deletedAt = null;
    user.status = 'active';
    return await this.userRepository.save(user);
  }

  async getUserWithWallets(userId: string): Promise<{ user: UserEntity; wallets: WalletEntity[] }> {
    const user = await this.findActiveUserById(userId);
    const wallets = await this.walletService.getWalletsByUser(userId);
    
    return { user, wallets };
  }

  // Wallet management methods
  async createWallet(userId: string, walletData: Partial<WalletEntity>): Promise<WalletEntity> {
    return await this.walletService.createWallet(userId, walletData);
  }

  async getWalletsByUser(userId: string): Promise<WalletEntity[]> {
    return await this.walletService.getWalletsByUser(userId);
  }

  async getWalletById(walletId: string): Promise<WalletEntity> {
    return await this.walletService.getWalletById(walletId);
  }

  // Update wallet
  async updateWallet(walletId: string, updateData: Partial<WalletEntity>): Promise<WalletEntity> {
    return await this.walletService.updateWallet(walletId, updateData);
  }

  // Soft delete wallet
  async softDeleteWallet(walletId: string): Promise<void> {
    await this.walletService.softDeleteWallet(walletId);
  }

  // User preferences methods (existing)
  async getPreferences(userId: string): Promise<UserPreferenceEntity> {
    let prefs = await this.preferencesRepo.findOne({ where: { userId } });
    if (!prefs) {
      // Create default preferences if they don't exist
      prefs = this.preferencesRepo.create({ userId, theme: 'system' });
      await this.preferencesRepo.save(prefs);
    }
    return prefs;
  }

  async updatePreferences(
    userId: string,
    dto: UpdateUserPreferencesDto,
  ): Promise<UserPreferenceEntity> {
    let prefs = await this.preferencesRepo.findOne({ where: { userId } });
    
    if (!prefs) {
      prefs = this.preferencesRepo.create({ userId, ...dto });
    } else {
      this.preferencesRepo.merge(prefs, dto);
    }

    return this.preferencesRepo.save(prefs);
  }
}
