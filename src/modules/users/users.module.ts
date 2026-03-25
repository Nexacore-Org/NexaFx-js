import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditModule } from '../admin-audit/admin-audit.module';
import { UserPreferenceEntity } from './entities/user-preference.entity';
import { UserEntity } from './entities/user.entity';
import { WalletEntity } from './entities/wallet.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserPreferenceEntity, UserEntity, WalletEntity]),
    AdminAuditModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, WalletService],
  exports: [UsersService, WalletService],
})
export class UsersModule {}
