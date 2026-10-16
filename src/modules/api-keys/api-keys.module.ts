import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeyEntity } from './entities/api-key.entity';
import { ApiKeysService } from './services/api-keys.service';
import { ApiKeysController } from './controllers/api-keys.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { ApiKeyAuthService } from './services/api-key-auth.service';
import { User } from '../../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKeyEntity, User])],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyGuard, ApiKeyAuthService, ApiKeyAuthGuard],
  exports: [ApiKeysService, ApiKeyGuard, ApiKeyAuthService, ApiKeyAuthGuard],
})
export class ApiKeysModule {}
