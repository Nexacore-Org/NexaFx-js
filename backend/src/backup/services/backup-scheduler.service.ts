import { Injectable, Logger } from "@nestjs/common"
import type { Repository } from "typeorm"
import type { SchedulerRegistry } from "@nestjs/schedule"
import { CronJob } from "cron"
import type { BackupSchedule } from "../entities/backup-schedule.entity"
import type { BackupService, BackupType } from "./backup.service"
import type { ConfigureScheduleDto } from "../dto/configure-schedule.dto"

@Injectable()
export class BackupSchedulerService {
  private readonly logger = new Logger(BackupSchedulerService.name)

  constructor(
    private readonly scheduleRepo: Repository<BackupSchedule>, 
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly backupService: BackupService,
  ) {
    this.initializeSchedules()
  }

  private async initializeSchedules() {
    const schedules = await this.scheduleRepo.find({ where: { enabled: true } })

    for (const schedule of schedules) {
      this.registerCronJob(schedule)
    }
  }

  private registerCronJob(schedule: BackupSchedule) {
    const job = new CronJob(schedule.cronExpression, async () => {
      this.logger.log(`Executing scheduled backup: ${schedule.name}`)
      await this.backupService.triggerManualBackup({
        type: schedule.backupType as BackupType,
        triggeredBy: "scheduler",
      })
    })

    this.schedulerRegistry.addCronJob(schedule.id, job)
    job.start()

    this.logger.log(`Registered cron job: ${schedule.name} (${schedule.cronExpression})`)
  }

  async configureSchedule(dto: ConfigureScheduleDto) {
    let schedule = await this.scheduleRepo.findOne({
      where: { name: dto.name },
    })

    if (schedule) {
      // Update existing schedule
      schedule.cronExpression = dto.cronExpression
      schedule.backupType = dto.backupType
      schedule.enabled = dto.enabled ?? schedule.enabled

      // Remove old cron job
      if (this.schedulerRegistry.doesExist("cron", schedule.id)) {
        this.schedulerRegistry.deleteCronJob(schedule.id)
      }
    } else {
      // Create new schedule
      schedule = this.scheduleRepo.create({
        name: dto.name,
        cronExpression: dto.cronExpression,
        backupType: dto.backupType,
        enabled: dto.enabled ?? true,
      })
    }

    await this.scheduleRepo.save(schedule)

    // Register new cron job if enabled
    if (schedule.enabled) {
      this.registerCronJob(schedule)
    }

    return {
      success: true,
      schedule,
    }
  }

  async getScheduleConfiguration() {
    const schedules = await this.scheduleRepo.find()
    return schedules
  }
}
