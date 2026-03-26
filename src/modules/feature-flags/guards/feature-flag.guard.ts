import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_FLAG_KEY } from '../decorators/feature-flag.decorator';
import { FeatureFlagEvaluationService } from '../services/feature-flag-evaluation.service';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly evaluationService: FeatureFlagEvaluationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flagName = this.reflector.get<string>(
      FEATURE_FLAG_KEY,
      context.getHandler(),
    );

    if (!flagName) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const userContext = {
      userId: user?.id ?? user?.sub ?? 'anonymous',
      role: user?.role,
      country: user?.country,
    };

    const enabled = await this.evaluationService.evaluate(flagName, userContext);

    if (!enabled) {
      throw new NotFoundException(`Feature not found`);
    }

    return true;
  }
}
