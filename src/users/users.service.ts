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

    // withDeleted: a closed (soft-deleted) account still owns the unique email, so re-registering
    // must be a clear 409 rather than a raw unique-index 500 (issue #1530).
    const existing = await repo.findOne({ where: { email }, withDeleted: true });
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

  /** Like {@link findById} but returns `null` instead of throwing when missing. */
  async findByIdOrNull(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  /**
   * Atomically count a failed login. The increment (and the lock, once the
   * threshold is reached) happen in a single UPDATE so concurrent guesses
   * cannot overwrite each other's count.
   */
  async recordFailedLogin(
    id: string,
    maxAttempts: number,
    lockoutMinutes: number,
  ): Promise<{ failedLoginAttempts: number; lockedUntil: Date | null; newlyLocked: boolean }> {
    const lockUntil = new Date(Date.now() + lockoutMinutes * 60_000);
    // A lock that has already expired starts a fresh count (issue #1534). Without this the counter
    // stayed at 5 forever, so after the first lockout a single later typo (count 6) re-locked the
    // user for another 30 minutes. Both columns derive from the same pre-update row values.
    const lockExpired = '("lockedUntil" IS NOT NULL AND "lockedUntil" <= now())';
    const nextCount = `(CASE WHEN ${lockExpired} THEN 1 ELSE "failedLoginAttempts" + 1 END)`;
    const result = await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set({
        failedLoginAttempts: () => nextCount,
        lockedUntil: () =>
          `CASE WHEN ${nextCount} >= :maxAttempts THEN :lockUntil WHEN ${lockExpired} THEN NULL ELSE "lockedUntil" END`,
      })
      .where('id = :id', { id })
      .setParameters({ maxAttempts, lockUntil })
      .returning(['failedLoginAttempts', 'lockedUntil'])
      .execute();

    const row = (result.raw as Array<{ failedLoginAttempts: number; lockedUntil: Date | null }>)?.[0];
    const lockedUntil = row?.lockedUntil ? new Date(row.lockedUntil) : null;
    return {
      failedLoginAttempts: Number(row?.failedLoginAttempts ?? 0),
      lockedUntil,
      // True only for the call that actually set the lock (its lockUntil is the stored value).
      newlyLocked: lockedUntil !== null && lockedUntil.getTime() === lockUntil.getTime(),
    };
  }

  /** Clear the lockout counters without touching any other column. */
  async resetLoginFailures(id: string): Promise<void> {
    await this.usersRepository.update(id, { failedLoginAttempts: 0, lockedUntil: null });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email: normalizeEmail(email) as string } });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    Object.assign(user, dto);
    return this.usersRepository.save(user);
  }

  /**
   * Set a new password. Also clears any lockout (the owner just proved control of the
   * account) and bumps `tokenVersion` so access tokens issued before the change stop
   * working (issue #1526). Pass `manager` to run inside the caller's transaction.
   */
  async updatePassword(id: string, newPasswordHash: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(User) : this.usersRepository;
    const user = await repo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    user.passwordHash = newPasswordHash;
    user.passwordChangedAt = new Date();
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await repo.save(user);
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
    user.isActive = false;
    await this.usersRepository.save(user);
    await this.usersRepository.softDelete(id);
  }
}
