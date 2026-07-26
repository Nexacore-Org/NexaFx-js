import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EndpointRateLimitConfigEntity } from './entities/endpoint-rate-limit-config.entity';
import { EndpointRateLimitService } from './services/endpoint-rate-limit.service';
import { EndpointRateLimitGuard } from './guards/endpoint-rate-limit.guard';
import { EndpointRateLimitController } from './controllers/endpoint-rate-limit.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([EndpointRateLimitConfigEntity]),
  ],
  controllers: [EndpointRateLimitController],
  providers: [EndpointRateLimitService, EndpointRateLimitGuard],
  exports: [EndpointRateLimitService, EndpointRateLimitGuard],
})
export class EndpointRateLimitModule {}
