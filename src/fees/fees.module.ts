import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeRecord } from './fee-record.entity';
import { FeesService } from './fees.service';

@Module({
  imports: [TypeOrmModule.forFeature([FeeRecord])],
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}
