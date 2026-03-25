import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisputeEntity } from './entities/dispute.entity';
import { DisputesService } from './services/disputes.service';

@Module({
  imports: [TypeOrmModule.forFeature([DisputeEntity])],
  providers: [DisputesService],
  exports: [DisputesService, TypeOrmModule],
})
export class DisputesModule {}
