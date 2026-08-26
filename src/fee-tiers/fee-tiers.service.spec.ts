import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { FeeTiersService } from './fee-tiers.service';
import { FeeTierEntity, KycFeeLevel } from './entities/fee-tier.entity';

describe('FeeTiersService', () => {
  let service: FeeTiersService;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeTiersService,
        { provide: getRepositoryToken(FeeTierEntity), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<FeeTiersService>(FeeTiersService);
    jest.clearAllMocks();
  });

  it('should throw NotFoundException if fee tier not found', async () => {
    mockRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.findOne('invalid-id')).rejects.toThrow(NotFoundException);
  });

  it('should return fee calculation with 0 fee if no matching tier found', async () => {
    const builder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    mockRepo.createQueryBuilder.mockReturnValue(builder);

    const res = await service.calculateFee('basic', 'USD', 100);
    expect(res.feeAmount).toBe(0);
    expect(res.totalAmount).toBe(100);
  });
});
