import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { EntityManager, Repository } from 'typeorm';
import { User, UserRole, KycStatus } from './user.entity';
import { normalizeEmail } from '../common/decorators/normalize-email.decorator';

export interface CreateUserDto {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
}

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  isEmailVerified?: boolean;
  kycStatus?: KycStatus;
  isActive?: boolean;
  require2fa?: boolean;
  failedLoginAttempts?: number;
  lockedUntil?: Date | null;
}

type WalletBalanceLoader = (userId: string) => Promise<Record<string, number>>;

@Injectable()
export class UsersService {
  private pendingFetches = new Map<string, Promise<Record<string, number>>>();

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {}

  private get walletBalanceCacheTtl(): number {
    return this.configService.get<number>('WALLET_BALANCE_CACHE_TTL_SECONDS', 30);
  }

  private getCacheKey(userId: string): string {
    return `wallet-balances:${userId}`;
  }

  async getWalletBalances(userId: string, loader: WalletBalanceLoader): Promise<Record<string, number>> {
    const cacheKey = this.getCacheKey(userId);
    const cached = await this.cacheManager.get<Record<string, number>>(cacheKey);
    if (cached) return cached;

    const pending = this.pendingFetches.get(userId);
    if (pending) return pending;

    const fetch = (async () => {
      try {
        const balances = await loader(userId);
        await this.cacheManager.set(cacheKey, balances, this.walletBalanceCacheTtl);
        return balances;
      } finally {
        this.pendingFetches.delete(userId);
      }
    })();

    this.pendingFetches.set(userId, fetch);
    return fetch;
  }

  async invalidateWalletBalanceCache(userId: string): Promise<void> {
    await this.cacheManager.del(this.getCacheKey(userId));
  }

  async create(dto: CreateUserDto, manager?: EntityManager): Promise<User> {
    const repo = manager ? manager.getRepository(User) : this.usersRepository;
    // Defence in depth: DTOs normalise, but other callers (seeds, admin tools)
    // must not be able to create a mixed-case duplicate either.
    const email = normalizeEmail(dto.email) as string;

    const existing = await repo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already in use');

    const user = repo.create({ ...dto, email, role: dto.role ?? UserRole.USER });
    return repo.save(user);
  }

  /**
   * Run `work` in one database transaction together with the creation of the
   * user, so a failure in `work` (terms acceptance, audit) leaves no orphan.
   */
  async createWithin<T>(
    dto: CreateUserDto,
    work: (user: User, manager: EntityManager) => Promise<T>,
  ): Promise<{ user: User; result: T }> {
    return this.usersRepository.manager.transaction(async (manager) => {
      const user = await this.create(dto, manager);
      const result = await work(user, manager);
      return { user, result };
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email: normalizeEmail(email) as string } });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    Object.assign(user, dto);
    return this.usersRepository.save(user);
  }

  async updatePassword(id: string, newPasswordHash: string): Promise<void> {
    const user = await this.findById(id);
    user.passwordHash = newPasswordHash;
    user.passwordChangedAt = new Date();
    await this.usersRepository.save(user);
  }

  sanitize(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.findById(id);
    const uuid = crypto.randomUUID();
    user.email = `deleted_${uuid}@deleted.invalid`;
    user.firstName = '[deleted]';
    user.lastName = '[deleted]';
    await this.usersRepository.save(user);
    await this.usersRepository.softDelete(id);
  }

  async exportUserData(userId: string) {
    const user = await this.findById(userId);
    return {
      exportId: `exp_${Date.now()}_${userId.slice(0, 6)}`,
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
      userData: {
        profile: this.sanitize(user),
        exportedSections: ['profile', 'wallets', 'transactions', 'notification_preferences', 'audit_logs'],
      },
    };
  }
}
