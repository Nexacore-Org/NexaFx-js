import { Injectable, Logger } from '@nestjs/common';

export interface PolicyContext {
  user: Record<string, any>;
  resource?: Record<string, any>;
  request?: any;
  extra?: Record<string, any>;
}

type PolicyHandler = (ctx: PolicyContext) => boolean | Promise<boolean>;

@Injectable()
export class PolicyEvaluatorService {
  private readonly logger = new Logger(PolicyEvaluatorService.name);
  private readonly policies = new Map<string, PolicyHandler>();

  register(name: string, handler: PolicyHandler): void {
    this.policies.set(name, handler);
  }

  async evaluate(name: string, ctx: PolicyContext): Promise<boolean> {
    const handler = this.policies.get(name);
    if (!handler) {
      this.logger.warn(`Policy '${name}' not registered — denying by default`);
      return false;
    }
    try {
      return await handler(ctx);
    } catch (err) {
      this.logger.error(`Policy '${name}' threw an error`, err);
      return false;
    }
  }

  has(name: string): boolean {
    return this.policies.has(name);
  }

  listPolicies(): string[] {
    return [...this.policies.keys()];
  }
}
