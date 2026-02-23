import { Test, TestingModule } from '@nestjs/testing';
import { FeeController } from './fee.controller';
import { FeeService } from './fee.service';

describe('FeeController', () => {
  let controller: FeeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeeController],
      providers: [FeeService],
    }).compile();

    controller = module.get<FeeController>(FeeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
