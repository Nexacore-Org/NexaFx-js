import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DisputeService } from '../services/dispute.service';

@Injectable()
export class DisputeAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private disputeService: DisputeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const disputeId = request.params.disputeId;

    if (!user || !disputeId) {
      return false;
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
