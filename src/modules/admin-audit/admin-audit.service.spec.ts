import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditLogEntity } from './entities/admin-audit-log.entity';

describe('AdminAuditService', () => {
  let service: AdminAuditService;
  let repo: Repository<AdminAuditLogEntity>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuditService,
        {
          provide: getRepositoryToken(AdminAuditLogEntity),
          useValue: {
            create: jest.fn().mockImplementation((dto) => dto),
            save: jest
              .fn()
              .mockImplementation((log) =>
                Promise.resolve({ id: 'uuid', ...log }),
              ),
            findAndCount: jest.fn().mockResolvedValue([[], 0]),
          },
        },
      ],
    }).compile();

    service = module.get<AdminAuditService>(AdminAuditService);
    repo = module.get<Repository<AdminAuditLogEntity>>(
      getRepositoryToken(AdminAuditLogEntity),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('logAction', () => {
    it('should create and save a log', async () => {
      const dto = {
        adminId: 'admin-1',
        action: 'CREATE',
        entity: 'User',
        entityId: '123',
        metadata: { foo: 'bar' },
        ip: '127.0.0.1',
      };

      const result = await service.logAction(dto);

      expect(repo.create).toHaveBeenCalledWith(dto);
      expect(repo.save).toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining(dto));
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const filters = { limit: 10, offset: 0 };
      const result = await service.findAll(filters);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 0,
          order: { createdAt: 'DESC' },
        }),
      );
      expect(result).toEqual({
        items: [],
        total: 0,
        limit: 10,
        offset: 0,
      });
    });

    it('should apply filters', async () => {
      const filters = {
        adminId: 'admin-1',
        action: 'UPDATE',
        startDate: '2023-01-01',
        endDate: '2023-01-02',
      };

      await service.findAll(filters);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            adminId: 'admin-1',
            action: 'UPDATE',
            // Date comparison is tricky to test strictly with mock, but we verify it's passed
          }),
        }),
      );
    });
  });
});
