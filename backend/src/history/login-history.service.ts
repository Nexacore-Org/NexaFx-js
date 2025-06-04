import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { LoginHistory } from './login-history.entity';
import { CreateLoginHistoryDto, LoginHistoryQueryDto } from './login-history.dto';

@Injectable()
export class LoginHistoryService {
  constructor(
    @InjectRepository(LoginHistory)
    private loginHistoryRepository: Repository<LoginHistory>,
  ) {}

  async create(createLoginHistoryDto: CreateLoginHistoryDto): Promise<LoginHistory> {
    const loginHistory = this.loginHistoryRepository.create(createLoginHistoryDto);
    return await this.loginHistoryRepository.save(loginHistory);
  }

  async findByUserId(
    userId: number,
    query: LoginHistoryQueryDto,
  ): Promise<{ data: LoginHistory[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 10, isSuccessful, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const whereCondition: any = { userId };

    if (isSuccessful !== undefined) {
      whereCondition.isSuccessful = isSuccessful;
    }

    if (startDate && endDate) {
      whereCondition.createdAt = Between(new Date(startDate), new Date(endDate));
    } else if (startDate) {
      whereCondition.createdAt = MoreThanOrEqual(new Date(startDate));
    } else if (endDate) {
      whereCondition.createdAt = LessThanOrEqual(new Date(endDate));
    }

    const [data, total] = await this.loginHistoryRepository.findAndCount({
      where: whereCondition,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async getRecentFailedAttempts(email: string, minutes: number = 15): Promise<number> {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
    
    return await this.loginHistoryRepository.count({
      where: {
        email,
        isSuccessful: false,
        createdAt: MoreThanOrEqual(cutoffTime),
      },
    });
  }

  async getLoginStats(userId: number, days: number = 30): Promise<any> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const [successfulLogins, failedLogins, totalLogins] = await Promise.all([
      this.loginHistoryRepository.count({
        where: {
          userId,
          isSuccessful: true,
          createdAt: MoreThanOrEqual(cutoffDate),
        },
      }),
      this.loginHistoryRepository.count({
        where: {
          userId,
          isSuccessful: false,
          createdAt: MoreThanOrEqual(cutoffDate),
        },
      }),
      this.loginHistoryRepository.count({
        where: {
          userId,
          createdAt: MoreThanOrEqual(cutoffDate),
        },
      }),
    ]);

    return {
      successfulLogins,
      failedLogins,
      totalLogins,
      successRate: totalLogins > 0 ? (successfulLogins / totalLogins) * 100 : 0,
      period: `${days} days`,
    };
  }
}