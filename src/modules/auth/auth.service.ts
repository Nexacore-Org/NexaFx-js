import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { UserEntity } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  /**
   * Validates if a user is active (not soft-deleted) and can login
   */
  async validateUserForLogin(userId: string): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      withDeleted: true, // Include soft deleted records to check if user is deleted
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if user is soft deleted
    if (user.deletedAt) {
      throw new UnauthorizedException('Account has been deactivated');
    }

    // Check if user status is active
    if (user.status === 'suspended' || user.status === 'deleted') {
      throw new UnauthorizedException('Account is suspended');
    }

    return user;
  }

  /**
   * Verifies if a user exists and is active (used in JWT validation)
   */
  async verifyUserIsActive(userId: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId, deletedAt: IsNull() }, // Only active users
    });

    return !!user;
  }
}
