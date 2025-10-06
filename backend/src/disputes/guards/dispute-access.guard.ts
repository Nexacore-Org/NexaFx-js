import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DisputeService } from '../services/dispute.service';
import type { Request } from 'express';

// Metadata key controlled by DisputeAccessMode decorator
export const DISPUTE_ACCESS_MODE_KEY = 'dispute_access_mode';

@Injectable()
export class DisputeAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private disputeService: DisputeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Request & {
        user: { id: string; isAdmin?: boolean; isAgent?: boolean };
        params: { disputeId: string };
      }
    >();
    const user = request.user;
    const disputeId = request.params.disputeId;
    const mode = this.reflector.getAllAndOverride<string>(
      DISPUTE_ACCESS_MODE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!user || !disputeId) {
      return false;
    }

    // Evidence mode delegates to service method with tailored authorization rules
    if (mode === 'evidence') {
      const canAccessEvidence =
        await this.disputeService.canAccessEvidenceWithUser(user, disputeId);
      if (!canAccessEvidence) {
        throw new ForbiddenException(
          'You do not have permission to access this evidence',
        );
      }
      return true;
    }

    const dispute = await this.disputeService.findOne(disputeId, false);

    // Check if dispute exists
    if (!dispute) {
      throw new ForbiddenException('Access denied to this dispute');
    }

    // Admin and agents can access any dispute
    if (user.isAgent || user.isAdmin) {
      return true;
    }

    // Users can only access their own disputes
    if (dispute.userId === user.id) {
      return true;
    }

    // Assigned agents can access their assigned disputes
    if (dispute.assignedToId === user.id) {
      return true;
    }

    throw new ForbiddenException('Access denied to this dispute');
  }
}
