import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RpcHealthService } from './rpc-health.service';
import { RpcHealthLogEntity } from '../entities/rpc-health-log.entity';
import axios from 'axios';

jest.mock('axios');

describe('RpcHealthService', () => {
  let service: RpcHealthService;
  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RpcHealthService,
        {
          provide: getRepositoryToken(RpcHealthLogEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<RpcHealthService>(RpcHealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkProviderHealth', () => {
    it('should return status up when axios call succeeds', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { result: '0x1' } });
      const result = await service.checkProviderHealth(
        'ethereum',
        'http://localhost:8545',
      );
      expect(result.status).toBe('up');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return status down when axios call fails', async () => {
      (axios.post as jest.Mock).mockRejectedValue(new Error('Network Error'));
      const result = await service.checkProviderHealth(
        'ethereum',
        'http://localhost:8545',
      );
      expect(result.status).toBe('down');
    });
  });

  describe('logHealth', () => {
    it('should save log to repository', async () => {
      const log = { network: 'ethereum', status: 'up' } as RpcHealthLogEntity;
      mockRepository.create.mockReturnValue(log);
      mockRepository.save.mockResolvedValue(log);

      const result = await service.logHealth('ethereum', 'url', 'up', 100);
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalledWith(log);
      expect(result).toEqual(log);
    });
  });
});
