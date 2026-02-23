import { Test, TestingModule } from '@nestjs/testing';
import { FeeService } from './fee.service';

describe('FeeService', () => {
  let service: FeeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FeeService],
    }).compile();

    service = module.get<FeeService>(FeeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
