import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsModule } from '../wallet/wallets.module';
import { AccountClosureController } from './account-closure.controller';
import { AccountClosureMailer } from './account-closure.mailer';
import { AccountClosureService } from './account-closure.service';
import { UserAccount } from './user-account.entity';
import { RefreshToken } from '../auth/refresh-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserAccount, RefreshToken]),
    JwtModule.register({}),
    WalletsModule,
  ],
  controllers: [AccountClosureController],
  providers: [AccountClosureService, AccountClosureMailer],
  exports: [AccountClosureService],
})
export class AccountClosureModule {}
