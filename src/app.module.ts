import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { ApiUsageLogEntity } from './modules/analytics/entities/api-usage-log.entity';
import { HealthModule } from './modules/health/health.module';
import { RpcHealthModule } from './modules/rpc-health/rpc-health.module';
import { RpcHealthLogEntity } from './modules/rpc-health/entities/rpc-health-log.entity';
import { FeatureFlagEntity } from './modules/feature-flags/entities/feature-flag.entity';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import { RateLimitRuleEntity } from './modules/rate-limit/entities/rate-limit-rule.entity';
import { RateLimitTrackerEntity } from './modules/rate-limit/entities/rate-limit-tracker.entity';
import { AdminAuditModule } from './modules/admin-audit/admin-audit.module';
import { AdminAuditLogEntity } from './modules/admin-audit/entities/admin-audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'nexafx_dev',
      entities: [
        ApiUsageLogEntity,
        RpcHealthLogEntity,
        RateLimitRuleEntity,
        RateLimitTrackerEntity,
        FeatureFlagEntity,
        AdminAuditLogEntity,
      ],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV === 'development',
    }),
    AnalyticsModule,
    HealthModule,
    RpcHealthModule,
    FeatureFlagsModule,
    RateLimitModule,
    AdminAuditModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
