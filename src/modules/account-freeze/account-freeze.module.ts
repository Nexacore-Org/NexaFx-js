import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountFreezeEntity } from './entities/account-freeze.entity';
import { AccountFreezeService } from './services/account-freeze.service';
import { AccountFreezeController } from './controllers/account-freeze.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AccountFreezeEntity])],
  controllers: [AccountFreezeController],
  providers: [AccountFreezeService],
  exports: [AccountFreezeService],
})
export class AccountFreezeModule {}
