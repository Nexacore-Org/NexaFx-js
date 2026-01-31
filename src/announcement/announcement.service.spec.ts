import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { Announcement, AnnouncementStatus } from './entities/announcement.entity';

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let repository: Repository<Announcement>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        {
          provide: getRepositoryToken(Announcement),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AnnouncementsService>(AnnouncementsService);
    repository = module.get<Repository<Announcement>>(
      getRepositoryToken(Announcement),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new announcement', async () => {
      const createDto = {
        title: 'New Feature',
        body: 'We released a new feature!',
        status: AnnouncementStatus.PUBLISHED,
      };

      const savedAnnouncement = {
        id: '123',
        ...createDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.create.mockReturnValue(savedAnnouncement);
      mockRepository.save.mockResolvedValue(savedAnnouncement);

      const result = await service.create(createDto);

      expect(repository.create).toHaveBeenCalledWith(createDto);
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(savedAnnouncement);
    });

    it('should throw BadRequestException if publishAt is after expiresAt', async () => {
      const createDto = {
        title: 'Invalid dates',
        body: 'This should fail',
        publishAt: new Date('2024-12-31'),
        expiresAt: new Date('2024-01-01'),
      };

      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findOne', () => {
    it('should return an announcement if found', async () => {
      const announcement = {
        id: '123',
        title: 'Test',
        body: 'Test body',
        status: AnnouncementStatus.PUBLISHED,
      };

      mockRepository.findOne.mockResolvedValue(announcement);

      const result = await service.findOne('123');

      expect(result).toEqual(announcement);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: '123' } });
    });

    it('should throw NotFoundException if announcement not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update an announcement', async () => {
      const existingAnnouncement = {
        id: '123',
        title: 'Old title',
        body: 'Old body',
        status: AnnouncementStatus.DRAFT,
      };

      const updateDto = {
        title: 'New title',
      };

      mockRepository.findOne.mockResolvedValue(existingAnnouncement);
      mockRepository.save.mockResolvedValue({
        ...existingAnnouncement,
        ...updateDto,
      });

      const result = await service.update('123', updateDto);

      expect(result.title).toBe('New title');
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove an announcement', async () => {
      const announcement = {
        id: '123',
        title: 'To be deleted',
        body: 'Delete me',
      };

      mockRepository.findOne.mockResolvedValue(announcement);
      mockRepository.remove.mockResolvedValue(announcement);

      await service.remove('123');

      expect(repository.remove).toHaveBeenCalledWith(announcement);
    });
  });

  describe('archive', () => {
    it('should archive an announcement', async () => {
      const announcement = {
        id: '123',
        title: 'Active',
        status: AnnouncementStatus.PUBLISHED,
      };

      mockRepository.findOne.mockResolvedValue(announcement);
      mockRepository.save.mockResolvedValue({
        ...announcement,
        status: AnnouncementStatus.ARCHIVED,
      });

      const result = await service.archive('123');

      expect(result.status).toBe(AnnouncementStatus.ARCHIVED);
    });
  });

  describe('publish', () => {
    it('should publish an announcement immediately', async () => {
      const announcement = {
        id: '123',
        title: 'Draft',
        status: AnnouncementStatus.DRAFT,
      };

      mockRepository.findOne.mockResolvedValue(announcement);
      mockRepository.save.mockResolvedValue({
        ...announcement,
        status: AnnouncementStatus.PUBLISHED,
        publishAt: expect.any(Date),
      });

      const result = await service.publish('123');

      expect(result.status).toBe(AnnouncementStatus.PUBLISHED);
      expect(result.publishAt).toBeDefined();
    });
  });
});