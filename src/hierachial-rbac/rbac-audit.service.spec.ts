import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RbacAuditService, LogAuditDto } from '../services/rbac-audit.service';
import { RbacAuditLog, RbacAuditAction } from '../entities/rbac-audit-log.entity';

describe('RbacAuditService', () => {
  let service: RbacAuditService;
  let repo: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacAuditService,
        {
          provide: getRepositoryToken(RbacAuditLog),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findAndCount: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(RbacAuditService);
    repo = module.get(getRepositoryToken(RbacAuditLog));
  });

  describe('log', () => {
    it('creates and saves an audit entry', async () => {
      const dto: LogAuditDto = {
        action: RbacAuditAction.ROLE_CREATED,
        actorId: 'actor-1',
        targetRoleId: 'role-1',
        newState: { name: 'NEW_ROLE' },
      };

      const entry = Object.assign(new RbacAuditLog(), dto);
      repo.create.mockReturnValue(entry);
      repo.save.mockResolvedValue(entry);

      const result = await service.log(dto);
      expect(repo.create).toHaveBeenCalledWith(dto);
      expect(repo.save).toHaveBeenCalledWith(entry);
      expect(result).toBe(entry);
    });

    it('returns null and does not throw on save failure', async () => {
      repo.create.mockReturnValue({});
      repo.save.mockRejectedValue(new Error('DB down'));

      const result = await service.log({ action: RbacAuditAction.ACCESS_DENIED, actorId: 'a' });
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('calls findAndCount with default options', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll();
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC' }, take: 50 }),
      );
    });

    it('merges custom options', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ take: 10, skip: 20 });
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 }),
      );
    });
  });

  describe('findByActor', () => {
    it('queries by actorId', async () => {
      repo.find.mockResolvedValue([]);
      await service.findByActor('actor-1');
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { actorId: 'actor-1' } }),
      );
    });
  });

  describe('findByTargetUser', () => {
    it('queries by targetUserId', async () => {
      repo.find.mockResolvedValue([]);
      await service.findByTargetUser('user-1');
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { targetUserId: 'user-1' } }),
      );
    });
  });
});
