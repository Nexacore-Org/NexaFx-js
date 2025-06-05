import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { AdminLogService, AdminLogEntry } from './admin-log.service';

export class CreateLogDto {
  adminId: string;
  action: string;
  details: string;
}

@Controller('admin-logs')
export class AdminLogController {
  constructor(private readonly adminLogService: AdminLogService) {}

  @Post()
  async createLog(@Body() createLogDto: CreateLogDto): Promise<AdminLogEntry> {
    return this.adminLogService.logAction(
      createLogDto.adminId,
      createLogDto.action,
      createLogDto.details,
    );
  }

  @Get()
  async getAllLogs(
    @Query('adminId') adminId?: string,
  ): Promise<AdminLogEntry[]> {
    if (adminId) {
      return this.adminLogService.getLogsByAdmin(adminId);
    }
    return this.adminLogService.getLogs();
  }

  @Get(':adminId')
  async getLogsByAdmin(
    @Param('adminId') adminId: string,
  ): Promise<AdminLogEntry[]> {
    return this.adminLogService.getLogsByAdmin(adminId);
  }
}
