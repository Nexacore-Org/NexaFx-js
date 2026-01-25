import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ApiUsageLogEntity } from './modules/analytics/entities/api-usage-log.entity';
import { RpcHealthModule } from './modules/rpc-health/rpc-health.module';
import { RpcHealthLogEntity } from './modules/rpc-health/entities/rpc-health-log.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'nexafx_dev',
      entities: [ApiUsageLogEntity, RpcHealthLogEntity],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV === 'development',
    }),
    AnalyticsModule,
    RpcHealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
