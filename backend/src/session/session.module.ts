import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { SessionService } from "./session.service"
import { SessionController } from "./session.controller"
import { SessionStorage } from "./storage/session.storage"
import { MemorySessionStorage } from "./storage/memory-session.storage"
import { RedisSessionStorage } from "./storage/redis-session.storage"
import { SessionGuard } from "./guards/session.guard"
import { SessionCleanupService } from "./services/session-cleanup.service"
import { SessionSecurityService } from "./services/session-security.service"

@Module({
  imports: [ConfigModule],
  providers: [
    SessionService,
    SessionGuard,
    SessionCleanupService,
    SessionSecurityService,
    {
      provide: SessionStorage,
      useFactory: (configService) => {
        const storageType = configService.get<string>("SESSION_STORAGE", "memory")

        if (storageType === "redis") {
          return new RedisSessionStorage(configService)
        }

        return new MemorySessionStorage()
      },
      inject: ["ConfigService"],
    },
  ],
  controllers: [SessionController],
  exports: [SessionService, SessionGuard, SessionSecurityService],
})
export class SessionModule {}
