import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeyEntity } from './entities/api-key.entity';
import { ApiKeyUsageLogEntity } from './entities/api-key-usage-log.entity';
import { ApiKeyService } from './services/api-key.service';
import { ApiKeyController, WebhookExampleController } from './controllers/api-key.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ApiKeyScopeGuard } from './guards/api-key-scope.guard';
import { ApiKeyLoggingInterceptor } from './interceptors/api-key-logging.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKeyEntity, ApiKeyUsageLogEntity])],
  controllers: [ApiKeyController, WebhookExampleController],
  providers: [
    ApiKeyService,
    ApiKeyGuard,
    ApiKeyScopeGuard,
    ApiKeyLoggingInterceptor,
  ],
  exports: [
    ApiKeyService,
    ApiKeyGuard,
    ApiKeyScopeGuard,
    ApiKeyLoggingInterceptor,
    TypeOrmModule,
  ],
})
export class ApiKeysModule {}
