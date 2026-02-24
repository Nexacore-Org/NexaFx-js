import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AdminAuditLogEntity } from './entities/admin-audit-log.entity';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditController } from './admin-audit.controller';
import { AuditInterceptor } from './interceptors/audit.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([AdminAuditLogEntity])],
  controllers: [AdminAuditController],
  providers: [
    AdminAuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AdminAuditService],
})
export class AdminAuditModule {}

// Re-export decorators for convenient imports
export * from './decorators';
export { ActorType } from './entities/admin-audit-log.entity';
