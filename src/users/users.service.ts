import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import type { Cache } from 'cache-manager';
import { User, UserRole, KycStatus } from './user.entity';
import { ConfigService } from '@nestjs/config';

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
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {}

  private get walletBalanceCacheTtl(): number {
    return this.configService.get<number>('WALLET_BALANCE_CACHE_TTL_SECONDS', 30);
  }

  async getCachedWalletBalance(userId: string, currency: string): Promise<number | null> {
    const cacheKey = `wallet-balances:${userId}`;
    const cached = await this.cacheManager.get<Record<string, number>>(cacheKey);
    if (cached && cached[currency] !== undefined) return cached[currency];
    return null;
  }

  async invalidateWalletBalanceCache(userId: string): Promise<void> {
    await this.cacheManager.del(`wallet-balances:${userId}`);
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const user = this.usersRepository.create({
      ...dto,
      role: dto.role ?? UserRole.USER,
    });
    return this.usersRepository.save(user);
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
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

  private get walletCacheTtl(): number {
    return this.configService.get<number>('WALLET_BALANCE_CACHE_TTL_SECONDS') ?? 30;
  }

  async getCachedWalletBalance(userId: string): Promise<number | null> {
    const cached = await this.cacheManager.get<number>(`wallet_balance:${userId}`);
    return cached ?? null;
  }

  async setCachedWalletBalance(userId: string, balance: number): Promise<void> {
    await this.cacheManager.set(`wallet_balance:${userId}`, balance, this.walletCacheTtl);
  }

  async invalidateWalletBalanceCache(userId: string): Promise<void> {
    await this.cacheManager.del(`wallet_balance:${userId}`);
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
}
