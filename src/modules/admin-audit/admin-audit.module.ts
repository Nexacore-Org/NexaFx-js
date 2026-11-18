import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditModule } from '../../audit/audit.module';
import { AdminAuditInterceptor } from './admin-audit.interceptor';

@Module({
  imports: [AuditModule],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor }],
})
export class AdminAuditModule {}
