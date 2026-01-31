import { Module } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceMiddleware } from './middleware/maintenance.middleware';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceConfig } from './entities/maintenance-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MaintenanceConfig])],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}