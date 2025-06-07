import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { RateLimitGuard } from "./guards/rate-limit.guard"
import { RateLimitService } from "./rate-limit.service"
import { RateLimitController } from "./rate-limit.controller"
import { RateLimitStorage } from "./storage/rate-limit.storage"
import { MemoryRateLimitStorage } from "./storage/memory-rate-limit.storage"
import { RedisRateLimitStorage } from "./storage/redis-rate-limit.storage"

@Module({
  imports: [ConfigModule],
  providers: [
    RateLimitService,
    RateLimitGuard,
    {
      provide: RateLimitStorage,
      useFactory: (configService) => {
        const storageType = configService.get<string>("RATE_LIMIT_STORAGE", "memory")

        if (storageType === "redis") {
          return new RedisRateLimitStorage(configService)
        }

        return new MemoryRateLimitStorage()
      },
      inject: ["ConfigService"],
    },
  ],
  controllers: [RateLimitController],
  exports: [RateLimitService, RateLimitGuard],
})
export class RateLimitModule {}
