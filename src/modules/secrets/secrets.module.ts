import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SecretEntity } from './entities/secret.entity';
import { SecretsService } from './services/secrets.service';
import { SecretsAdminController } from './controllers/secrets-admin.controller';

@Module({
  imports: [ScheduleModule.forRoot(), TypeOrmModule.forFeature([SecretEntity])],
  providers: [SecretsService],
  controllers: [SecretsAdminController],
  exports: [SecretsService],
})
export class SecretsModule {}
