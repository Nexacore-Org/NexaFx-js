import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsModule } from '../wallet/wallets.module';
import { TokensModule } from '../tokens/tokens.module';
import { AuditModule } from '../audit/audit.module';
import { PasswordService } from '../auth/password.service';
import { AccountClosureController } from './account-closure.controller';
import { AccountClosureMailer } from './account-closure.mailer';
import { AccountClosurePurgeJob } from './account-closure.purge.job';
import { AccountClosureService } from './account-closure.service';
import { User } from './user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User]), WalletsModule, TokensModule, AuditModule],
  controllers: [AccountClosureController],
  providers: [AccountClosureService, AccountClosureMailer, AccountClosurePurgeJob, PasswordService],
  exports: [AccountClosureService],
})
export class AccountClosureModule {}
