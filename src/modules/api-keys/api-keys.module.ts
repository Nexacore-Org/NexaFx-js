import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from './entities/api-key.entity';
import { ApiKeyUsageLog } from './entities/api-key-usage-log.entity';
import { ApiKeyService } from './services/api-key.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ApiKeyController } from './controllers/api-key.controller';
import { ApiUsageMiddleware } from './middleware/api-usage.middleware';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey, ApiKeyUsageLog])],
  controllers: [ApiKeyController],
  providers: [ApiKeyService, ApiKeyGuard],
  exports: [ApiKeyService, ApiKeyGuard],
})
export class ApiKeysModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ApiUsageMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
