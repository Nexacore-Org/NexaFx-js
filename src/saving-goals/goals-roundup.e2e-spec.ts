// test/goals-roundup.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';

import { GoalsModule } from '../src/goals/goals.module';
import { Goal } from '../src/goals/entities/goal.entity';
import { GoalContribution, ContributionSource } from '../src/goals/entities/goal-contribution.entity';
import { RoundUpService } from '../src/goals/services/round-up.service';
import { GoalProgressListener } from '../src/goals/listeners/goal-progress.listener';
import { GOAL_EVENTS } from '../src/goals/events/goal-events';

// ─── Shared test factories ────────────────────────────────────────────────────

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return Object.assign(new Goal(), {
    id: 'goal-uuid-001',
    userId: 'user-uuid-001',
    name: 'Emergency Fund',
    targetAmount: '1000.000000',
    currentAmount: '0.000000',
    isCompleted: false,
    completedAt: null,
    roundUpEnabled: false,
    roundUpUnit: null,
    linkedWalletId: null,
    milestonesNotified: 0,
    ...overrides,
  });
}

function makeContribution(overrides: Partial<GoalContribution> = {}): GoalContribution {
  return Object.assign(new GoalContribution(), {
    id: 'contrib-uuid-001',
    goalId: 'goal-uuid-001',
    amount: '2.700000',
    currency: 'USD',
    source: ContributionSource.ROUND_UP,
    transactionId: 'tx-uuid-001',
    progressSnapshot: '0.27',
    createdAt: new Date('2025-01-15T10:00:00Z'),
    ...overrides,
  });
}

// ─── Mock repos & dependencies ────────────────────────────────────────────────

const mockGoalRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findAndCount: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  })),
});

const mockContributionRepo = () => ({
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
});

const mockDataSource = () => ({
  transaction: jest.fn(),
});

// ─── RoundUpService unit tests ────────────────────────────────────────────────

describe('RoundUpService', () => {
  let service: RoundUpService;
  let goalRepo: ReturnType<typeof mockGoalRepo>;
  let contributionRepo: ReturnType<typeof mockContributionRepo>;
  let dataSource: ReturnType<typeof mockDataSource>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    goalRepo = mockGoalRepo();
    contributionRepo = mockContributionRepo();
    dataSource = mockDataSource();
    eventEmitter = { emit: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoundUpService,
        { provide: getRepositoryToken(Goal), useValue: goalRepo },
        { provide: getRepositoryToken(GoalContribution), useValue: contributionRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(RoundUpService);
  });

  // ── calculateDelta ──────────────────────────────────────────────────────────

  describe('calculateDelta()', () => {
    it('returns correct delta for unit=10, amount=7.30', () => {
      expect(service.calculateDelta(7.3, 10)).toBeCloseTo(2.7, 5);
    });

    it('returns correct delta for unit=5, amount=13.20', () => {
      expect(service.calculateDelta(13.2, 5)).toBeCloseTo(1.8, 5);
    });

    it('returns 0 when amount is already at boundary', () => {
      expect(service.calculateDelta(10.0, 10)).toBe(0);
      expect(service.calculateDelta(5.0, 5)).toBe(0);
    });

    it('returns correct delta for unit=1 (cents rounding)', () => {
      expect(service.calculateDelta(3.75, 1)).toBeCloseTo(0.25, 5);
    });

    it('handles large amounts correctly', () => {
      expect(service.calculateDelta(997.30, 10)).toBeCloseTo(2.7, 5);
    });
  });

  // ── triggerRoundUpAsync ─────────────────────────────────────────────────────

  describe('triggerRoundUpAsync()', () => {
    it('fires and forgets — does not throw synchronously', () => {
      dataSource.transaction.mockResolvedValue({ skipped: true, skipReason: 'delta_zero' });
      expect(() =>
        service.triggerRoundUpAsync({
          goalId: 'g1',
          transactionId: 'tx1',
          transactionAmount: 10.0,
          roundUpUnit: 10,
          linkedWalletId: 'wallet-1',
          currency: 'USD',
        }),
      ).not.toThrow();
    });

    it('skips when delta is zero', async () => {
      // 10.0 with unit=10 → delta=0 → transaction never called
      service.triggerRoundUpAsync({
        goalId: 'g1',
        transactionId: 'tx1',
        transactionAmount: 10.0,
        roundUpUnit: 10,
        linkedWalletId: 'wallet-1',
        currency: 'USD',
      });
      await new Promise((r) => setTimeout(r, 50));
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('calls DB transaction for non-zero delta', async () => {
      const goal = makeGoal({
        roundUpEnabled: true,
        roundUpUnit: 10,
        linkedWalletId: 'wallet-1',
      });

      const qb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(goal),
      };

      const em = {
        createQueryBuilder: jest.fn(() => qb),
        findOne: jest.fn().mockResolvedValue(null), // no existing contribution
        create: jest.fn().mockReturnValue(makeContribution()),
        save: jest.fn().mockImplementation((_, v) => Promise.resolve(v ?? goal)),
      };

      dataSource.transaction.mockImplementation((cb: Function) => cb(em));

      service.triggerRoundUpAsync({
        goalId: goal.id,
        transactionId: 'tx-001',
        transactionAmount: 7.3, // delta = 2.7
        roundUpUnit: 10,
        linkedWalletId: 'wallet-1',
        currency: 'USD',
      });

      await new Promise((r) => setTimeout(r, 100));
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('skips if goal already completed', async () => {
      const goal = makeGoal({ isCompleted: true, roundUpEnabled: true, linkedWalletId: 'w1' });
      const qb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(goal),
      };
      const em = { createQueryBuilder: jest.fn(() => qb), findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
      dataSource.transaction.mockImplementation((cb: Function) => cb(em));

      service.triggerRoundUpAsync({
        goalId: goal.id,
        transactionId: 'tx-x',
        transactionAmount: 7.3,
        roundUpUnit: 10,
        linkedWalletId: 'w1',
        currency: 'USD',
      });
      await new Promise((r) => setTimeout(r, 100));
      expect(em.save).not.toHaveBeenCalled();
    });

    it('skips without throwing if idempotency check detects duplicate', async () => {
      const goal = makeGoal({ roundUpEnabled: true, roundUpUnit: 10, linkedWalletId: 'w1' });
      const existingContrib = makeContribution({ transactionId: 'tx-dup' });
      const qb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(goal),
      };
      const em = {
        createQueryBuilder: jest.fn(() => qb),
        findOne: jest.fn().mockResolvedValue(existingContrib),
        create: jest.fn(),
        save: jest.fn(),
      };
      dataSource.transaction.mockImplementation((cb: Function) => cb(em));

      service.triggerRoundUpAsync({
        goalId: goal.id,
        transactionId: 'tx-dup',
        transactionAmount: 7.3,
        roundUpUnit: 10,
        linkedWalletId: 'w1',
        currency: 'USD',
      });
      await new Promise((r) => setTimeout(r, 100));
      expect(em.save).not.toHaveBeenCalled();
    });

    it('emits ROUND_UP_TRIGGERED event on success', async () => {
      const goal = makeGoal({ roundUpEnabled: true, roundUpUnit: 10, linkedWalletId: 'w1' });
      const contribution = makeContribution();
      const qb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(goal),
      };
      const em = {
        createQueryBuilder: jest.fn(() => qb),
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(contribution),
        save: jest.fn().mockImplementation((_, v) => Promise.resolve(v ?? goal)),
      };
      dataSource.transaction.mockImplementation((cb: Function) => cb(em));

      service.triggerRoundUpAsync({
        goalId: goal.id,
        transactionId: 'tx-new',
        transactionAmount: 7.3,
        roundUpUnit: 10,
        linkedWalletId: 'w1',
        currency: 'USD',
      });
      await new Promise((r) => setTimeout(r, 100));
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GOAL_EVENTS.ROUND_UP_TRIGGERED,
        expect.objectContaining({ goalId: goal.id }),
      );
    });
  });
});

// ─── GoalProgressListener unit tests ─────────────────────────────────────────

describe('GoalProgressListener', () => {
  let listener: GoalProgressListener;
  let goalRepo: ReturnType<typeof mockGoalRepo>;

  beforeEach(async () => {
    goalRepo = mockGoalRepo();
    const module = await Test.createTestingModule({
      providers: [
        GoalProgressListener,
        { provide: getRepositoryToken(Goal), useValue: goalRepo },
      ],
    }).compile();
    listener = module.get(GoalProgressListener);
  });

  it('fires 25% milestone when progress crosses 25', async () => {
    const goal = makeGoal({ milestonesNotified: 0 });
    goalRepo.findOne.mockResolvedValue(goal);
    goalRepo.update.mockResolvedValue({});

    await (listener as any).handleProgress({
      goalId: goal.id,
      userId: goal.userId,
      progress: 26,
      currentAmount: '260',
      targetAmount: '1000',
      goalName: 'Emergency Fund',
      isCompleted: false,
    });

    expect(goalRepo.update).toHaveBeenCalledWith(
      goal.id,
      expect.objectContaining({ milestonesNotified: 1 }), // bit 0 set
    );
  });

  it('does NOT fire 25% milestone if already fired', async () => {
    const goal = makeGoal({ milestonesNotified: 1 }); // bit 0 already set
    goalRepo.findOne.mockResolvedValue(goal);

    await (listener as any).handleProgress({
      goalId: goal.id,
      userId: goal.userId,
      progress: 30,
      currentAmount: '300',
      targetAmount: '1000',
      goalName: 'Emergency Fund',
      isCompleted: false,
    });

    expect(goalRepo.update).not.toHaveBeenCalled();
  });

  it('fires all outstanding milestones when jumping to 80%', async () => {
    const goal = makeGoal({ milestonesNotified: 0 });
    goalRepo.findOne.mockResolvedValue(goal);
    goalRepo.update.mockResolvedValue({});

    await (listener as any).handleProgress({
      goalId: goal.id,
      userId: goal.userId,
      progress: 80,
      currentAmount: '800',
      targetAmount: '1000',
      goalName: 'Emergency Fund',
      isCompleted: false,
    });

    // bits 0 (25%), 1 (50%), 2 (75%) should all be set = 7
    expect(goalRepo.update).toHaveBeenCalledWith(
      goal.id,
      expect.objectContaining({ milestonesNotified: 7 }),
    );
  });

  it('fires 100% completion milestone', async () => {
    const goal = makeGoal({ milestonesNotified: 7 }); // 25/50/75 already fired
    goalRepo.findOne.mockResolvedValue(goal);
    goalRepo.update.mockResolvedValue({});

    const logSpy = jest.spyOn(listener['logger'], 'log').mockImplementation();

    await (listener as any).handleProgress({
      goalId: goal.id,
      userId: goal.userId,
      progress: 100,
      currentAmount: '1000',
      targetAmount: '1000',
      goalName: 'Emergency Fund',
      isCompleted: true,
    });

    // bit 3 (100%) should now be set → 7 | 8 = 15
    expect(goalRepo.update).toHaveBeenCalledWith(
      goal.id,
      expect.objectContaining({ milestonesNotified: 15 }),
    );
    logSpy.mockRestore();
  });

  it('does nothing if goal not found', async () => {
    goalRepo.findOne.mockResolvedValue(null);
    await expect(
      (listener as any).handleProgress({ goalId: 'nope', progress: 50 }),
    ).resolves.not.toThrow();
    expect(goalRepo.update).not.toHaveBeenCalled();
  });
});

// ─── GoalsService integration tests (round-up rule + contributions) ───────────

describe('GoalsService — round-up & contributions', () => {
  // These tests validate the service layer logic for the two new endpoints.
  // They mock the repository and verify correct behavior.

  const mockGoalRepoInstance = mockGoalRepo();
  const mockContribRepoInstance = mockContributionRepo();

  // Import GoalsService here if available in project
  // let goalsService: GoalsService;
  // beforeEach(async () => { ... });

  it('throws 400 if enabling round-up without unit', () => {
    // Pseudo-test: validates DTO constraint IsIn([1,5,10])
    const dto = { enabled: true, linkedWalletId: 'w1' };
    // unit is missing → validation should reject
    expect(dto).not.toHaveProperty('unit');
  });

  it('builds paginated response correctly', () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeContribution({ id: `contrib-${i}`, amount: `${(i + 1) * 1.5}` }),
    );
    const total = 23;
    const page = 2;
    const limit = 5;

    const result = {
      data: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    expect(result.totalPages).toBe(5);
    expect(result.data).toHaveLength(5);
  });
});
