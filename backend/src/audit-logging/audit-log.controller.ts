import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    UseGuards,
    Request,
    HttpCode,
    HttpStatus,
    Delete,
    Param,
  } from '@nestjs/common';
  import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiQuery,
  } from '@nestjs/swagger';
  import { AuditLogService } from './audit-log.service';
  import {
    CreateAuditLogDto,
    QueryAuditLogsDto,
    AuditLogResponseDto,
    PaginatedAuditLogsResponseDto,
  } from './audit-log.dto';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Adjust import path
  import { RolesGuard } from '../auth/guards/roles.guard'; // Adjust import path
  import { Roles } from '../auth/decorators/roles.decorator'; // Adjust import path
  import { Role } from '../users/entities/user.entity'; // Adjust import path
  
  @ApiTags('Audit Logs')
  @Controller('audit-logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  export class AuditLogController {
    constructor(private readonly auditLogService: AuditLogService) {}
  
    @Post()
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create audit log entry (Admin only)' })
    @ApiResponse({
      status: 201,
      description: 'Audit log created successfully',
      type: AuditLogResponseDto,
    })
    @ApiResponse({ status: 403, description: 'Insufficient permissions' })
    async create(@Body() createAuditLogDto: CreateAuditLogDto): Promise<AuditLogResponseDto> {
      return this.auditLogService.createLog(createAuditLogDto);
    }
  
    @Get()
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    @ApiOperation({ summary: 'Get audit logs with filtering and pagination (Admin only)' })
    @ApiResponse({
      status: 200,
      description: 'Audit logs retrieved successfully',
      type: PaginatedAuditLogsResponseDto,
    })
    @ApiResponse({ status: 403, description: 'Insufficient permissions' })
    async findAll(@Query() queryDto: QueryAuditLogsDto): Promise<PaginatedAuditLogsResponseDto> {
      return this.auditLogService.findAll(queryDto);
    }
  
    @Get('my-logs')
    @ApiOperation({ summary: 'Get current user audit logs' })
    @ApiResponse({
      status: 200,
      description: 'User audit logs retrieved successfully',
      type: [AuditLogResponseDto],
    })
    async getMyLogs(@Request() req): Promise<AuditLogResponseDto[]> {
      return this.auditLogService.findByUserId(req.user.id);
    }
  
    @Get('user/:userId')
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    @ApiOperation({ summary: 'Get audit logs for specific user (Admin only)' })
    @ApiResponse({
      status: 200,
      description: 'User audit logs retrieved successfully',
      type: [AuditLogResponseDto],
    })
    @ApiResponse({ status: 403, description: 'Insufficient permissions' })
    async getUserLogs(@Param('userId') userId: string): Promise<AuditLogResponseDto[]> {
      return this.auditLogService.findByUserId(userId);
    }
  
    @Get('statistics')
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    @ApiOperation({ summary: 'Get audit log statistics (Admin only)' })
    @ApiResponse({
      status: 200,
      description: 'Statistics retrieved successfully',
    })
    @ApiResponse({ status: 403, description: 'Insufficient permissions' })
    async getStatistics() {
      return this.auditLogService.getStatistics();
    }
  
    @Delete('cleanup/:days')
    @Roles(Role.SUPER_ADMIN)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Delete old audit logs (Super Admin only)' })
    @ApiResponse({
      status: 200,
      description: 'Old logs deleted successfully',
    })
    @ApiResponse({ status: 403, description: 'Insufficient permissions' })
    async cleanup(@Param('days') days: string) {
      const daysToKeep = parseInt(days, 10);
      const deletedCount = await this.auditLogService.deleteOldLogs(daysToKeep);
      return {
        message: `Deleted ${deletedCount} old audit logs`,
        deletedCount,
        daysToKeep,
      };
    }
  }