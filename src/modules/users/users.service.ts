import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, ILike, In } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import { WalletEntity } from './entities/wallet.entity';
import { UserPreferenceEntity } from './entities/user-preference.entity';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
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

  // ---------------------------------------------------------------------------
  // Profile endpoints (issue #315)
  // ---------------------------------------------------------------------------

  async getProfile(userId: string): Promise<Omit<UserEntity, 'passwordHash'>> {
    const user = await this.findActiveUserById(userId);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...profile } = user as UserEntity & { passwordHash?: string };
    return profile;
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<Omit<UserEntity, 'passwordHash'>> {
    const user = await this.findActiveUserById(userId);

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;

    // Store extended profile fields in metadata
    user.metadata = user.metadata ?? {};
    if (dto.timezone !== undefined) user.metadata.timezone = dto.timezone;
    if (dto.currencyPreference !== undefined) user.metadata.currencyPreference = dto.currencyPreference;
    if (dto.language !== undefined) user.metadata.language = dto.language;

    const saved = await this.userRepository.save(user);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...profile } = saved as UserEntity & { passwordHash?: string };
    return profile;
  }

  async deactivateUser(userId: string): Promise<void> {
    await this.softDeleteUser(userId, userId, ActorType.USER);
    // Session revocation is handled by the caller (controller layer) via AuthBlacklistService
  }

  // ---------------------------------------------------------------------------
  // Admin user management (issue #315)
  // ---------------------------------------------------------------------------

  async adminSearchUsers(opts: {
    search?: string;
    role?: string;
    status?: string;
    page: number;
    limit: number;
  }) {
    const qb = this.userRepository
      .createQueryBuilder('u')
      .orderBy('u.createdAt', 'DESC');

    if (opts.search) {
      qb.andWhere(
        '(u.email ILIKE :q OR u.firstName ILIKE :q OR u.lastName ILIKE :q)',
        { q: `%${opts.search}%` },
      );
    }

    if (opts.status) {
      qb.andWhere('u.status = :status', { status: opts.status });
    }

    if (opts.role) {
      // role is stored in metadata JSONB
      qb.andWhere("u.metadata->>'role' = :role", { role: opts.role });
    }

    const [data, total] = await qb
      .skip((opts.page - 1) * opts.limit)
      .take(opts.limit)
      .getManyAndCount();

    return {
      data: data.map(({ passwordHash: _pw, ...u }) => u),
      total,
      page: opts.page,
      limit: opts.limit,
    };
  }

  async adminUpdateUserStatus(
    targetUserId: string,
    adminId: string,
    status: 'active' | 'suspended',
    reason?: string,
  ): Promise<Omit<UserEntity, 'passwordHash'>> {
    if (targetUserId === adminId) {
      throw new ForbiddenException('Admin cannot change their own status');
    }

    const user = await this.findUserById(targetUserId);

    const previousStatus = user.status;
    user.status = status;
    const saved = await this.userRepository.save(user);

    try {
      const auditDto = new CreateAdminAuditLogDto();
      auditDto.actorId = adminId;
      auditDto.actorType = ActorType.ADMIN;
      auditDto.action = status === 'suspended' ? 'SUSPEND_USER' : 'REACTIVATE_USER';
      auditDto.entity = 'User';
      auditDto.entityId = targetUserId;
      auditDto.beforeSnapshot = { status: previousStatus };
      auditDto.afterSnapshot = { status };
      auditDto.metadata = { reason };
      auditDto.description = `Admin ${adminId} changed user ${targetUserId} status to ${status}${reason ? `: ${reason}` : ''}`;
      await this.adminAuditService.logAction(auditDto);
    } catch {
      // Audit log failure must not block the status update
    }

    const { passwordHash: _pw, ...profile } = saved as UserEntity & { passwordHash?: string };
    return profile;
  }

  async adminBulkUpdateStatus(
    userIds: string[],
    adminId: string,
    status: 'active' | 'suspended',
    reason?: string,
  ): Promise<{ updated: number; failed: string[] }> {
    if (userIds.length > 100) {
      throw new BadRequestException('Bulk operations are limited to 100 users per request');
    }

    const failed: string[] = [];
    let updated = 0;

    const users = await this.userRepository.find({
      where: { id: In(userIds) },
      withDeleted: false,
    });

    const foundIds = new Set(users.map((u) => u.id));
    for (const id of userIds) {
      if (!foundIds.has(id)) failed.push(id);
    }

    for (const user of users) {
      if (user.id === adminId) {
        failed.push(user.id);
        continue;
      }
      try {
        user.status = status;
        await this.userRepository.save(user);

        const auditDto = new CreateAdminAuditLogDto();
        auditDto.actorId = adminId;
        auditDto.actorType = ActorType.ADMIN;
        auditDto.action = status === 'suspended' ? 'BULK_SUSPEND_USER' : 'BULK_REACTIVATE_USER';
        auditDto.entity = 'User';
        auditDto.entityId = user.id;
        auditDto.afterSnapshot = { status };
        auditDto.metadata = { reason, bulkOperation: true };
        auditDto.description = `Bulk status update: user ${user.id} → ${status}`;
        await this.adminAuditService.logAction(auditDto);

        updated++;
      } catch {
        failed.push(user.id);
      }
    }

    return { updated, failed };
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
