import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThanOrEqual, IsNull } from 'typeorm';
import { Announcement, AnnouncementStatus } from './entities/announcement.entity';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { QueryAnnouncementsDto } from './dto/query-announcements.dto';

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
  ) {}

  /**
   * Create a new announcement
   */
  async create(createAnnouncementDto: CreateAnnouncementDto): Promise<Announcement> {
    // Validate dates
    if (
      createAnnouncementDto.publishAt &&
      createAnnouncementDto.expiresAt &&
      createAnnouncementDto.publishAt >= createAnnouncementDto.expiresAt
    ) {
      throw new BadRequestException('Expiration date must be after publish date');
    }

    const announcement = this.announcementRepository.create(createAnnouncementDto);
    return await this.announcementRepository.save(announcement);
  }

  /**
   * Find all announcements with optional filtering
   */
  async findAll(query: QueryAnnouncementsDto = {}): Promise<Announcement[]> {
    const queryBuilder = this.announcementRepository.createQueryBuilder('announcement');

    // Filter by status if provided
    if (query.status) {
      queryBuilder.andWhere('announcement.status = :status', { status: query.status });
    }

    // Filter for active announcements only
    if (query.activeOnly) {
      const now = new Date();
      queryBuilder
        .andWhere('announcement.status = :status', { status: AnnouncementStatus.PUBLISHED })
        .andWhere(
          '(announcement.publishAt IS NULL OR announcement.publishAt <= :now)',
          { now },
        )
        .andWhere(
          '(announcement.expiresAt IS NULL OR announcement.expiresAt > :now)',
          { now },
        );
    }

    // Include or exclude scheduled announcements
    if (query.includeScheduled === false && !query.activeOnly) {
      const now = new Date();
      queryBuilder.andWhere(
        '(announcement.publishAt IS NULL OR announcement.publishAt <= :now)',
        { now },
      );
    }

    // Order by publish date (newest first), then created date
    queryBuilder
      .orderBy('announcement.publishAt', 'DESC', 'NULLS LAST')
      .addOrderBy('announcement.createdAt', 'DESC');

    return await queryBuilder.getMany();
  }

  /**
   * Find a single announcement by ID
   */
  async findOne(id: string): Promise<Announcement> {
    const announcement = await this.announcementRepository.findOne({
      where: { id },
    });

    if (!announcement) {
      throw new NotFoundException(`Announcement with ID ${id} not found`);
    }

    return announcement;
  }

  /**
   * Update an announcement
   */
  async update(
    id: string,
    updateAnnouncementDto: UpdateAnnouncementDto,
  ): Promise<Announcement> {
    const announcement = await this.findOne(id);

    // Validate dates if both are being updated
    const newPublishAt = updateAnnouncementDto.publishAt ?? announcement.publishAt;
    const newExpiresAt = updateAnnouncementDto.expiresAt ?? announcement.expiresAt;

    if (newPublishAt && newExpiresAt && newPublishAt >= newExpiresAt) {
      throw new BadRequestException('Expiration date must be after publish date');
    }

    Object.assign(announcement, updateAnnouncementDto);
    return await this.announcementRepository.save(announcement);
  }

  /**
   * Delete an announcement
   */
  async remove(id: string): Promise<void> {
    const announcement = await this.findOne(id);
    await this.announcementRepository.remove(announcement);
  }

  /**
   * Get active announcements (public endpoint helper)
   */
  async getActiveAnnouncements(): Promise<Announcement[]> {
    return this.findAll({ activeOnly: true });
  }

  /**
   * Archive an announcement
   */
  async archive(id: string): Promise<Announcement> {
    return this.update(id, { status: AnnouncementStatus.ARCHIVED });
  }

  /**
   * Publish an announcement immediately
   */
  async publish(id: string): Promise<Announcement> {
    return this.update(id, {
      status: AnnouncementStatus.PUBLISHED,
      publishAt: new Date(),
    });
  }
}