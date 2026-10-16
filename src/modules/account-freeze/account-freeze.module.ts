import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountFreezeEntity } from './entities/account-freeze.entity';
import { AccountFreezeService } from './services/account-freeze.service';
import { AccountFreezeController } from './controllers/account-freeze.controller';
import { User } from '../../users/user.entity';
import { AuditModule } from '../../audit/audit.module';

// Global so any money-moving service can inject AccountFreezeService and call
// assertNotFrozen() without wiring this module into its own imports.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AccountFreezeEntity, User]), AuditModule],
  controllers: [AccountFreezeController],
  providers: [AccountFreezeService],
  exports: [AccountFreezeService],
})
export class AccountFreezeModule {}
