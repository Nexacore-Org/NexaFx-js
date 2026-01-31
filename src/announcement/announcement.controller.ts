import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { Announcement } from './entities/announcement.entity';
import { QueryAnnouncementsDto } from './dto/query-announcements.dto';

/**
 * Public controller for announcements
 * Can be accessed without authentication or with optional authentication
 */
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  /**
   * GET /announcements
   * Retrieve announcements for public display
   * By default, returns only active announcements
   */
  @Get()
  async findAll(@Query() query: QueryAnnouncementsDto): Promise<Announcement[]> {
    // Default to showing only active announcements for public endpoint
    const activeOnly = query.activeOnly !== undefined ? query.activeOnly : true;
    
    return this.announcementsService.findAll({
      ...query,
      activeOnly,
    });
  }
}