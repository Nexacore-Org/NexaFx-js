import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeTierEntity } from './entities/fee-tier.entity';
import { FeeTiersService } from './fee-tiers.service';
import { FeeTiersController } from './fee-tiers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FeeTierEntity])],
  controllers: [FeeTiersController],
  providers: [FeeTiersService],
  exports: [FeeTiersService],
})
export class FeeTiersModule {}
