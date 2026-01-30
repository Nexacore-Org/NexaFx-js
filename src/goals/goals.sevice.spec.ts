import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoalsService } from './goals.service';
import { Goal, GoalStatus } from './entities/goal.entity';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

describe('GoalsService', () => {
  let service: GoalsService;
  let repository: Repository<Goal>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    })),
  };

  const mockGoal: Goal = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    userId: 'user-123',
    title: 'Save for vacation',
    description: 'Trip to Japan',
    targetAmount: 5000,
    currentAmount: 1000,
    currency: 'USD',
    deadline: new Date('2025-12-31'),
    status: GoalStatus.ACTIVE,
    linkedWalletId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    progressPercentage: 20,
    isOverdue: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalsService,
        {
          provide: getRepositoryToken(Goal),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<GoalsService>(GoalsService);
    repository = module.get<Repository<Goal>>(getRepositoryToken(Goal));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new goal successfully', async () => {
      const createGoalDto: CreateGoalDto = {
        title: 'Save for vacation',
        description: 'Trip to Japan',
        targetAmount: 5000,
        currency: 'USD',
        deadline: '2025-12-31T23:59:59Z',
      };

      mockRepository.create.mockReturnValue(mockGoal);
      mockRepository.save.mockResolvedValue(mockGoal);

      const result = await service.create('user-123', createGoalDto);

      expect(result).toBeDefined();
      expect(result.title).toBe(createGoalDto.title);
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          title: createGoalDto.title,
        }),
      );
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if deadline is in the past', async () => {
      const createGoalDto: CreateGoalDto = {
        title: 'Save for vacation',
        targetAmount: 5000,
        deadline: '2020-01-01T00:00:00Z', // Past date
      };

      await expect(service.create('user-123', createGoalDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if current amount exceeds target', async () => {
      const createGoalDto: CreateGoalDto = {
        title: 'Save for vacation',
        targetAmount: 5000,
        currentAmount: 6000,
      };

      await expect(service.create('user-123', createGoalDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should auto-complete goal if current amount meets target', async () => {
      const createGoalDto: CreateGoalDto = {
        title: 'Save for vacation',
        targetAmount: 5000,
        currentAmount: 5000,
      };

      const completedGoal = { ...mockGoal, status: GoalStatus.COMPLETED };
      mockRepository.create.mockReturnValue(completedGoal);
      mockRepository.save.mockResolvedValue(completedGoal);

      const result = await service.create('user-123', createGoalDto);

      expect(result.status).toBe(GoalStatus.COMPLETED);
    });
  });

  describe('findAll', () => {
    it('should return all goals for a user', async () => {
      const goals = [mockGoal];
      const queryBuilder = mockRepository.createQueryBuilder();
      queryBuilder.getMany = jest.fn().mockResolvedValue(goals);

      const result = await service.findAll('user-123');

      expect(result.goals).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.summary).toBeDefined();
    });

    it('should filter goals by status', async () => {
      const goals = [mockGoal];
      const queryBuilder = mockRepository.createQueryBuilder();
      queryBuilder.getMany = jest.fn().mockResolvedValue(goals);

      const result = await service.findAll('user-123', GoalStatus.ACTIVE);

      expect(result.goals).toHaveLength(1);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'goal.status = :status',
        { status: GoalStatus.ACTIVE },
      );
    });
  });

  describe('findOne', () => {
    it('should return a goal by id', async () => {
      mockRepository.findOne.mockResolvedValue(mockGoal);

      const result = await service.findOne(mockGoal.id, 'user-123');

      expect(result).toBeDefined();
      expect(result.id).toBe(mockGoal.id);
    });

    it('should throw NotFoundException if goal does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('invalid-id', 'user-123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user does not own the goal', async () => {
      mockRepository.findOne.mockResolvedValue(mockGoal);

      await expect(service.findOne(mockGoal.id, 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('should update a goal successfully', async () => {
      const updateGoalDto: UpdateGoalDto = {
        title: 'Updated title',
        targetAmount: 6000,
      };

      const updatedGoal = { ...mockGoal, ...updateGoalDto };
      mockRepository.findOne.mockResolvedValue(mockGoal);
      mockRepository.save.mockResolvedValue(updatedGoal);

      const result = await service.update(mockGoal.id, 'user-123', updateGoalDto);

      expect(result.title).toBe(updateGoalDto.title);
      expect(result.targetAmount).toBe(updateGoalDto.targetAmount);
    });

    it('should throw NotFoundException if goal does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('invalid-id', 'user-123', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own the goal', async () => {
      mockRepository.findOne.mockResolvedValue(mockGoal);

      await expect(
        service.update(mockGoal.id, 'other-user', {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete a goal successfully', async () => {
      mockRepository.findOne.mockResolvedValue(mockGoal);
      mockRepository.remove.mockResolvedValue(mockGoal);

      await service.remove(mockGoal.id, 'user-123');

      expect(mockRepository.remove).toHaveBeenCalledWith(mockGoal);
    });

    it('should throw NotFoundException if goal does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('invalid-id', 'user-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProgress', () => {
    it('should update goal progress', async () => {
      const updatedGoal = { ...mockGoal, currentAmount: 1500 };
      mockRepository.findOne.mockResolvedValue(mockGoal);
      mockRepository.save.mockResolvedValue(updatedGoal);

      const result = await service.updateProgress(mockGoal.id, 'user-123', 500);

      expect(result.currentAmount).toBe(1500);
    });

    it('should not allow negative current amount', async () => {
      const updatedGoal = { ...mockGoal, currentAmount: 0 };
      mockRepository.findOne.mockResolvedValue(mockGoal);
      mockRepository.save.mockResolvedValue(updatedGoal);

      const result = await service.updateProgress(mockGoal.id, 'user-123', -2000);

      expect(result.currentAmount).toBe(0);
    });

    it('should auto-complete goal when target is reached', async () => {
      const updatedGoal = {
        ...mockGoal,
        currentAmount: 5000,
        status: GoalStatus.COMPLETED,
      };
      mockRepository.findOne.mockResolvedValue(mockGoal);
      mockRepository.save.mockResolvedValue(updatedGoal);

      const result = await service.updateProgress(mockGoal.id, 'user-123', 4000);

      expect(result.status).toBe(GoalStatus.COMPLETED);
    });

    it('should throw BadRequestException if goal is not active', async () => {
      const inactiveGoal = { ...mockGoal, status: GoalStatus.COMPLETED };
      mockRepository.findOne.mockResolvedValue(inactiveGoal);

      await expect(
        service.updateProgress(mockGoal.id, 'user-123', 500),
      ).rejects.toThrow(BadRequestException);
    });
  });
});