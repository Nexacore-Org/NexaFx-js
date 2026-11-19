import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { UserDeactivationEntity } from '../entities/user-deactivation.entity';
import { DeactivateUserDto } from '../dto/user-deactivation.dto';
import { USER_ACCESS_CHANGED_EVENT, UserAccessChangedEvent } from '../../../auth/account-status.service';
import { TOKEN_VERSION_CHANGED_EVENT } from '../../../auth/token-version.service';
import { AuditService } from '../../../audit/audit.service';
import { User, UserRole } from '../../../users/user.entity';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class UserDeactivationService {
  private readonly logger = new Logger(UserDeactivationService.name);

  constructor(
    @InjectRepository(UserDeactivationEntity)
    private readonly deactivationRepo: Repository<UserDeactivationEntity>,
    private readonly audit: AuditService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  private announce(userId: string, reason: UserAccessChangedEvent['reason']): void {
    const event: UserAccessChangedEvent = {
      userId,
      reason,
      revokeTokens: reason === 'deactivated',
    };
    this.events?.emit(USER_ACCESS_CHANGED_EVENT, event);
  }

  /**
   * Deactivate a user. Attributable (a real admin id is required), race-free (user row
   * locked + partial unique index on active records, 23505 mapped to 409), and refused for
   * unknown users, the caller themselves and the last active admin (issue #1523).
   */
  async deactivate(
    userId: string,
    dto: DeactivateUserDto,
    adminId: string,
  ): Promise<UserDeactivationEntity> {
    if (!adminId) {
      throw new UnauthorizedException('An authenticated admin is required');
    }
    if (userId === adminId) {
      throw new ForbiddenException('Admins cannot deactivate their own account');
    }

    let saved: UserDeactivationEntity;
    try {
      saved = await this.deactivationRepo.manager.transaction(async (manager) => {
        const user = await manager.findOne(User, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
        if (!user) {
          throw new NotFoundException(`User ${userId} not found`);
        }

        if (user.role === UserRole.ADMIN) {
          const otherActiveAdmins = await manager.count(User, {
            where: { role: UserRole.ADMIN, isActive: true, id: Not(userId) },
          });
          if (otherActiveAdmins === 0) {
            throw new ConflictException('Cannot deactivate the last active admin');
          }
        }

        const existing = await manager.findOne(UserDeactivationEntity, { where: { userId, isActive: true } });
        if (existing) {
          throw new ConflictException(`User ${userId} is already deactivated`);
        }

        const record = manager.create(UserDeactivationEntity, {
          userId,
          reason: dto.reason,
          deactivatedBy: adminId,
          deactivatedAt: new Date(),
          isActive: true,
        });
        const row = await manager.save(UserDeactivationEntity, record);

        // Access tokens issued before this point stop working immediately.
        user.tokenVersion = (user.tokenVersion ?? 0) + 1;
        await manager.save(User, user);

        await this.audit.log(
          {
            userId: adminId,
            action: 'admin.user.deactivated',
            entityType: 'user',
            entityId: userId,
            before: { deactivated: false },
            after: { deactivated: true },
            reason: dto.reason,
          },
          manager,
        );
        return row;
      });
    } catch (err) {
      if ((err as { code?: string })?.code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException(`User ${userId} is already deactivated`);
      }
      throw err;
    }

    this.events?.emit(TOKEN_VERSION_CHANGED_EVENT, { userId });
    // Revoke refresh tokens and drop cached status so access stops now.
    this.announce(userId, 'deactivated');
    return saved;
  }

  async reactivate(userId: string, adminId: string): Promise<UserDeactivationEntity> {
    if (!adminId) {
      throw new UnauthorizedException('An authenticated admin is required');
    }

    const saved = await this.deactivationRepo.manager.transaction(async (manager) => {
      const record = await manager.findOne(UserDeactivationEntity, { where: { userId, isActive: true } });
      if (!record) {
        throw new NotFoundException(`No active deactivation found for user ${userId}`);
      }

      record.isActive = false;
      record.reactivatedBy = adminId;
      record.reactivatedAt = new Date();
      const row = await manager.save(UserDeactivationEntity, record);

      await this.audit.log(
        {
          userId: adminId,
          action: 'admin.user.reactivated',
          entityType: 'user',
          entityId: userId,
          before: { deactivated: true },
          after: { deactivated: false },
        },
        manager,
      );
      return row;
    });

    this.announce(userId, 'reactivated');
    return saved;
  }

  async isUserDeactivated(userId: string): Promise<boolean> {
    const record = await this.deactivationRepo.findOne({
      where: { userId, isActive: true },
    });
    return !!record;
  }

  async getHistory(userId: string, page = 1, limit = 20) {
    const [data, total] = await this.deactivationRepo.findAndCount({
      where: { userId },
      order: { deactivatedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }
}
