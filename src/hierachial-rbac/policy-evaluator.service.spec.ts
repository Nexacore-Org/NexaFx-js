import { Test, TestingModule } from '@nestjs/testing';
import { PolicyEvaluatorService, PolicyContext } from '../policies/policy-evaluator.service';

describe('PolicyEvaluatorService', () => {
  let service: PolicyEvaluatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PolicyEvaluatorService],
    }).compile();

    service = module.get(PolicyEvaluatorService);
  });

  it('registers and evaluates a synchronous policy', async () => {
    service.register('always-allow', () => true);
    const result = await service.evaluate('always-allow', { user: {} });
    expect(result).toBe(true);
  });

  it('registers and evaluates an async policy', async () => {
    service.register('async-deny', async () => false);
    const result = await service.evaluate('async-deny', { user: {} });
    expect(result).toBe(false);
  });

  it('returns false for unknown policy (deny-by-default)', async () => {
    const result = await service.evaluate('nonexistent-policy', { user: {} });
    expect(result).toBe(false);
  });

  it('returns false when policy throws an error', async () => {
    service.register('broken-policy', () => {
      throw new Error('Something went wrong');
    });
    const result = await service.evaluate('broken-policy', { user: {} });
    expect(result).toBe(false);
  });

  it('passes full context to the policy handler', async () => {
    const captured: PolicyContext[] = [];
    service.register('capture-context', (ctx) => {
      captured.push(ctx);
      return true;
    });

    const context: PolicyContext = {
      user: { id: 'user-123', email: 'a@b.com' },
      resource: { id: 'res-456' },
      extra: { flag: true },
    };

    await service.evaluate('capture-context', context);
    expect(captured[0]).toEqual(context);
  });

  it('supports self-only policy pattern', async () => {
    service.register('self-only', (ctx) => ctx.user?.id === ctx.resource?.userId);

    const allowed = await service.evaluate('self-only', {
      user: { id: 'u1' },
      resource: { userId: 'u1' },
    });
    const denied = await service.evaluate('self-only', {
      user: { id: 'u1' },
      resource: { userId: 'u2' },
    });

    expect(allowed).toBe(true);
    expect(denied).toBe(false);
  });

  it('listPolicies returns registered policy names', () => {
    service.register('policy-a', () => true);
    service.register('policy-b', () => false);
    expect(service.listPolicies()).toContain('policy-a');
    expect(service.listPolicies()).toContain('policy-b');
  });

  it('has() correctly reports existence', () => {
    service.register('existing', () => true);
    expect(service.has('existing')).toBe(true);
    expect(service.has('nonexistent')).toBe(false);
  });

  it('overrides previous policy with same name', async () => {
    service.register('overrideable', () => true);
    service.register('overrideable', () => false);
    const result = await service.evaluate('overrideable', { user: {} });
    expect(result).toBe(false);
  });
});
