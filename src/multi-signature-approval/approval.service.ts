import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AdminApproval, AdminApprovalStatus } from './admin-approval.entity';
import { ApprovalActionType } from './dto/approval.dto';

/** Runs an approved action. Receives the approval transaction's manager so it can join it. */
export type ApprovalHandler = (
  actionData: any,
  approvedBy: string,
  manager: EntityManager,
) => Promise<unknown>;

/**
 * Four-eyes approval workflow for high-risk admin actions. The service owns
 * the lifecycle (request, approve) and knows nothing about what an action
 * does: the owning module registers a handler per action type, which keeps
 * this module free of a dependency on `AdminService` (no import cycle).
 */
@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);
  private readonly handlers = new Map<string, ApprovalHandler>();

  constructor(
    @InjectRepository(AdminApproval)
    private readonly approvalsRepository: Repository<AdminApproval>,
  ) {}

  registerHandler(actionType: ApprovalActionType | string, handler: ApprovalHandler): void {
    this.handlers.set(actionType, handler);
  }

  async requestAdminApproval(actionType: string, actionData: unknown, requestedBy: string) {
    if (!requestedBy) {
      throw new ForbiddenException('An authenticated admin is required to request approval');
    }
    if (!(Object.values(ApprovalActionType) as string[]).includes(actionType)) {
      throw new BadRequestException(`Unknown approval action type: ${actionType}`);
    }
    const approval = this.approvalsRepository.create({
      actionType,
      actionData,
      requestedBy,
      status: AdminApprovalStatus.PENDING,
    });
    return this.approvalsRepository.save(approval);
  }

  /**
   * Approve and execute in one transaction. The pending -> approved flip is a
   * conditional UPDATE (a concurrent second approver affects no row and gets
   * 409), and the action runs on the same transaction: if it throws, the whole
   * transaction rolls back, so the request stays PENDING instead of being left
   * APPROVED with nothing done. The failure is recorded on the row afterwards.
   */
  async approveAdminRequest(approvalId: string, approvedBy: string) {
    if (!approvedBy) {
      throw new ForbiddenException('An authenticated admin is required to approve');
    }

    let handlerError: unknown;
    try {
      return await this.approvalsRepository.manager.transaction(async (manager) => {
        const approval = await manager.findOne(AdminApproval, { where: { id: approvalId } });
        if (!approval) throw new NotFoundException(`Approval request ${approvalId} not found`);

        if (approval.status !== AdminApprovalStatus.PENDING) {
          throw new ConflictException('Approval request is not pending');
        }
        if (!approval.requestedBy || approval.requestedBy === approvedBy) {
          throw new ForbiddenException('Admin cannot approve their own request');
        }
        const handler = this.handlers.get(approval.actionType);
        if (!handler) {
          throw new BadRequestException(`No handler registered for action type: ${approval.actionType}`);
        }

        const claimed = await manager.update(
          AdminApproval,
          { id: approvalId, status: AdminApprovalStatus.PENDING },
          { status: AdminApprovalStatus.APPROVED, approvedBy, lastError: null },
        );
        if (!claimed.affected) {
          throw new ConflictException('Approval request was already handled');
        }

        try {
          await handler(approval.actionData ?? {}, approvedBy, manager);
        } catch (err) {
          handlerError = err; // the transaction rolls back, so the approval stays PENDING
          throw err;
        }

        return (await manager.findOne(AdminApproval, { where: { id: approvalId } })) as AdminApproval;
      });
    } catch (err) {
      if (handlerError) await this.recordFailure(approvalId, handlerError);
      throw err;
    }
  }

  /** Pending requests first, newest first (issue #1519). */
  async listAdminRequests(status: AdminApprovalStatus = AdminApprovalStatus.PENDING) {
    return this.approvalsRepository.find({ where: { status }, order: { createdAt: 'DESC' }, take: 100 });
  }

  /**
   * Reject a pending request. Anyone with admin access may reject, including the requester
   * (who is effectively cancelling it); only approval requires a different admin. The
   * pending -> rejected flip is conditional, so a request that was just approved cannot be
   * rejected and a second rejection gets 409. There is no dedicated rejection column, so the
   * rejector and reason are recorded in `lastError` ("Rejected by <id>: <reason>").
   */
  async rejectAdminRequest(approvalId: string, rejectedBy: string, reason?: string) {
    if (!rejectedBy) {
      throw new ForbiddenException('An authenticated admin is required to reject');
    }
    const approval = await this.approvalsRepository.findOne({ where: { id: approvalId } });
    if (!approval) throw new NotFoundException(`Approval request ${approvalId} not found`);

    const note = `Rejected by ${rejectedBy}${reason ? `: ${reason}` : ''}`.slice(0, 500);
    const result = await this.approvalsRepository.update(
      { id: approvalId, status: AdminApprovalStatus.PENDING },
      { status: AdminApprovalStatus.REJECTED, lastError: note },
    );
    if (!result.affected) {
      throw new ConflictException('Approval request is not pending');
    }
    return (await this.approvalsRepository.findOne({ where: { id: approvalId } })) as AdminApproval;
  }

  /** Remember why the approved action failed, without ever changing the status. */
  private async recordFailure(approvalId: string, err: unknown): Promise<void> {
    try {
      await this.approvalsRepository.update(
        { id: approvalId, status: AdminApprovalStatus.PENDING },
        { lastError: String((err as Error)?.message ?? err).slice(0, 500) },
      );
    } catch (recordErr) {
      this.logger.warn(`Could not record approval failure: ${(recordErr as Error).message}`);
    }
  }
}
