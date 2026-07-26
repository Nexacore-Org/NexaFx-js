import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpendingCategoryEntity } from './entities/spending-category.entity';
import { SpendingEntryEntity } from './entities/spending-entry.entity';
import { SpendingService } from './spending.service';
import { SpendingController } from './spending.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SpendingCategoryEntity, SpendingEntryEntity])],
  controllers: [SpendingController],
  providers: [SpendingService],
  exports: [SpendingService],
})
export class SpendingModule {}
