import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnnouncementsModule } from './announcements.module';
import { Announcement, AnnouncementStatus } from './entities/announcement.entity';

describe('Announcements (e2e)', () => {
  let app: INestApplication;
  let repository: Repository<Announcement>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AnnouncementsModule],
    })
      .overrideProvider(getRepositoryToken(Announcement))
      .useValue({
        create: jest.fn(),
        save: jest.fn(),
        findOne: jest.fn(),
        remove: jest.fn(),
        createQueryBuilder: jest.fn(() => ({
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn(),
        })),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    repository = moduleFixture.get<Repository<Announcement>>(
      getRepositoryToken(Announcement),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /announcements (Public)', () => {
    it('should return active announcements', () => {
      const mockAnnouncements = [
        {
          id: '1',
          title: 'Active announcement',
          body: 'Test',
          status: AnnouncementStatus.PUBLISHED,
          publishAt: new Date('2024-01-01'),
          expiresAt: new Date('2025-12-31'),
        },
      ];

      const queryBuilder = repository.createQueryBuilder();
      (queryBuilder.getMany as jest.Mock).mockResolvedValue(mockAnnouncements);

      return request(app.getHttpServer())
        .get('/announcements')
        .expect(200)
        .expect(mockAnnouncements);
    });

    it('should filter announcements by status', () => {
      return request(app.getHttpServer())
        .get('/announcements?status=published')
        .expect(200);
    });
  });

  describe('POST /admin/announcements', () => {
    it('should create a new announcement', () => {
      const createDto = {
        title: 'New Feature',
        body: 'We have launched a new feature',
        status: 'published',
      };

      const savedAnnouncement = {
        id: '123',
        ...createDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (repository.create as jest.Mock).mockReturnValue(savedAnnouncement);
      (repository.save as jest.Mock).mockResolvedValue(savedAnnouncement);

      return request(app.getHttpServer())
        .post('/admin/announcements')
        .send(createDto)
        .expect(201)
        .expect((res) => {
          expect(res.body.title).toBe(createDto.title);
        });
    });

    it('should validate required fields', () => {
      return request(app.getHttpServer())
        .post('/admin/announcements')
        .send({
          body: 'Missing title',
        })
        .expect(400);
    });
  });

  describe('PATCH /admin/announcements/:id', () => {
    it('should update an announcement', () => {
      const existingAnnouncement = {
        id: '123',
        title: 'Old title',
        body: 'Old body',
        status: AnnouncementStatus.DRAFT,
      };

      const updateDto = {
        title: 'Updated title',
      };

      (repository.findOne as jest.Mock).mockResolvedValue(existingAnnouncement);
      (repository.save as jest.Mock).mockResolvedValue({
        ...existingAnnouncement,
        ...updateDto,
      });

      return request(app.getHttpServer())
        .patch('/admin/announcements/123')
        .send(updateDto)
        .expect(200)
        .expect((res) => {
          expect(res.body.title).toBe('Updated title');
        });
    });
  });

  describe('DELETE /admin/announcements/:id', () => {
    it('should delete an announcement', () => {
      const announcement = {
        id: '123',
        title: 'To delete',
        body: 'Delete me',
      };

      (repository.findOne as jest.Mock).mockResolvedValue(announcement);
      (repository.remove as jest.Mock).mockResolvedValue(announcement);

      return request(app.getHttpServer())
        .delete('/admin/announcements/123')
        .expect(204);
    });
  });

  describe('PATCH /admin/announcements/:id/archive', () => {
    it('should archive an announcement', () => {
      const announcement = {
        id: '123',
        title: 'Active',
        status: AnnouncementStatus.PUBLISHED,
      };

      (repository.findOne as jest.Mock).mockResolvedValue(announcement);
      (repository.save as jest.Mock).mockResolvedValue({
        ...announcement,
        status: AnnouncementStatus.ARCHIVED,
      });

      return request(app.getHttpServer())
        .patch('/admin/announcements/123/archive')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe(AnnouncementStatus.ARCHIVED);
        });
    });
  });

  describe('PATCH /admin/announcements/:id/publish', () => {
    it('should publish an announcement immediately', () => {
      const announcement = {
        id: '123',
        title: 'Draft',
        status: AnnouncementStatus.DRAFT,
      };

      (repository.findOne as jest.Mock).mockResolvedValue(announcement);
      (repository.save as jest.Mock).mockResolvedValue({
        ...announcement,
        status: AnnouncementStatus.PUBLISHED,
        publishAt: new Date(),
      });

      return request(app.getHttpServer())
        .patch('/admin/announcements/123/publish')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe(AnnouncementStatus.PUBLISHED);
          expect(res.body.publishAt).toBeDefined();
        });
    });
  });
});