import { Injectable } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import type { SessionService } from "../session.service"

@Injectable()
export class SessionCleanupService {
  constructor(private readonly sessionService: SessionService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredSessions(): Promise<void> {
    try {
      const cleanedCount = await this.sessionService.cleanupExpiredSessions()
      console.log(`Scheduled cleanup: removed ${cleanedCount} expired sessions`)
    } catch (error) {
      console.error("Failed to cleanup expired sessions:", error)
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateDailyReport(): Promise<void> {
    try {
      const statistics = await this.sessionService.getSessionStatistics(24 * 60 * 60 * 1000)
      console.log("Daily session report:", {
        date: new Date().toISOString().split("T")[0],
        ...statistics,
      })
    } catch (error) {
      console.error("Failed to generate daily session report:", error)
    }
  }
}
