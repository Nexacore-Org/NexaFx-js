import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';

@Injectable()
export class VerifiedGuard implements CanActivate {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.sub) {
      return false;
    }

    const dbUser = await this.userRepository.findOne({
      where: { id: user.sub },
      select: ['emailVerifiedAt'],
    });

    if (!dbUser || !dbUser.emailVerifiedAt) {
      throw new ForbiddenException('Email verification required for this action');
    }

    return true;
  }
}
