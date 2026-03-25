import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SecretVersion } from './entities/secret-version.entity';
import { SecretsService } from './services/secrets.service';
import { SecretsAdminController } from './controllers/secrets-admin.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([SecretVersion]),
    forwardRef(() => AuthModule),
  ],
  providers: [SecretsService],
  controllers: [SecretsAdminController],
  exports: [SecretsService],
})
export class SecretsModule {}
