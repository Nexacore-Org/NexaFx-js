import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { QueryAnnouncementsDto } from './dto/query-announcements.dto';
import { Announcement } from './entities/announcement.entity';
import { AuditLog } from '../modules/admin-audit/decorators/audit-log.decorator';
import { SkipAudit } from '../modules/admin-audit/decorators/skip-audit.decorator';

/**
 * Admin controller for managing announcements
 * All endpoints should be protected with admin authentication guard
 * 
 * To use this controller, uncomment the @UseGuards decorator
 * and import your AdminGuard or similar authentication guard
 */
@Controller('admin/announcements')
// @UseGuards(AdminGuard) // Uncomment and add your admin guard
export class AdminAnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  /**
   * POST /admin/announcements
   * Create a new announcement
   */
  @Post()
  @AuditLog({
    action: 'CREATE_ANNOUNCEMENT',
    entity: 'Announcement',
    description: 'Admin created a new announcement',
  })
  async create(@Body() createAnnouncementDto: CreateAnnouncementDto): Promise<Announcement> {
    return this.announcementsService.create(createAnnouncementDto);
  }

  /**
   * GET /admin/announcements
   * Retrieve all announcements with optional filters
   */
  @Get()
  @SkipAudit()
  async findAll(@Query() query: QueryAnnouncementsDto): Promise<Announcement[]> {
    return this.announcementsService.findAll(query);
  }

  /**
   * GET /admin/announcements/:id
   * Retrieve a specific announcement
   */
  @Get(':id')
  @SkipAudit()
  async findOne(@Param('id') id: string): Promise<Announcement> {
    return this.announcementsService.findOne(id);
  }

  /**
   * PATCH /admin/announcements/:id
   * Update an announcement
   */
  @Patch(':id')
  @AuditLog({
    action: 'UPDATE_ANNOUNCEMENT',
    entity: 'Announcement',
    entityIdParam: 'id',
    description: 'Admin updated an announcement',
  })
  async update(
    @Param('id') id: string,
    @Body() updateAnnouncementDto: UpdateAnnouncementDto,
  ): Promise<Announcement> {
    return this.announcementsService.update(id, updateAnnouncementDto);
  }

  /**
   * DELETE /admin/announcements/:id
   * Delete an announcement
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuditLog({
    action: 'DELETE_ANNOUNCEMENT',
    entity: 'Announcement',
    entityIdParam: 'id',
    description: 'Admin deleted an announcement',
  })
  async remove(@Param('id') id: string): Promise<void> {
    return this.announcementsService.remove(id);
  }

  /**
   * PATCH /admin/announcements/:id/archive
   * Archive an announcement
   */
  @Patch(':id/archive')
  @AuditLog({
    action: 'ARCHIVE_ANNOUNCEMENT',
    entity: 'Announcement',
    entityIdParam: 'id',
    description: 'Admin archived an announcement',
  })
  async archive(@Param('id') id: string): Promise<Announcement> {
    return this.announcementsService.archive(id);
  }

  /**
   * PATCH /admin/announcements/:id/publish
   * Publish an announcement immediately
   */
  @Patch(':id/publish')
  @AuditLog({
    action: 'PUBLISH_ANNOUNCEMENT',
    entity: 'Announcement',
    entityIdParam: 'id',
    description: 'Admin published an announcement',
  })
  async publish(@Param('id') id: string): Promise<Announcement> {
    return this.announcementsService.publish(id);
  }
}