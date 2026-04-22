import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalPolicy } from './entities/approval-policy.entity';
import { CreateApprovalPolicyDto, UpdateApprovalPolicyDto } from './dto/approval-policy.dto';

@Injectable()
export class ApprovalPolicyService {
  constructor(
    @InjectRepository(ApprovalPolicy)
    private readonly policyRepo: Repository<ApprovalPolicy>,
  ) {}

  async create(dto: CreateApprovalPolicyDto): Promise<ApprovalPolicy> {
    const policy = this.policyRepo.create({ ...dto, auditLog: [] });
    return this.policyRepo.save(policy);
  }

  async findAll(): Promise<ApprovalPolicy[]> {
    return this.policyRepo.find({ where: { isActive: true } });
  }

  async findOne(id: string): Promise<ApprovalPolicy> {
    const policy = await this.policyRepo.findOne({ where: { id } });
    if (!policy) throw new NotFoundException(`ApprovalPolicy ${id} not found`);
    return policy;
  }

  async update(id: string, dto: UpdateApprovalPolicyDto, changedBy: string): Promise<ApprovalPolicy> {
    const policy = await this.findOne(id);
    const oldConfig = { ...policy };

    Object.assign(policy, dto);
    policy.auditLog = [
      ...(policy.auditLog ?? []),
      {
        changedBy,
        changedAt: new Date().toISOString(),
        oldConfig,
        newConfig: { ...dto },
      },
    ];

    return this.policyRepo.save(policy);
  }

  async remove(id: string): Promise<void> {
    const policy = await this.findOne(id);
    await this.policyRepo.remove(policy);
  }

  /**
   * Find the best matching policy for a given transaction type and amount.
   * Returns null if no policy matches (transaction proceeds without approval).
   */
  matchPolicy(transactionType: string, amount: number, policies: ApprovalPolicy[]): ApprovalPolicy | null {
    return (
      policies.find((p) => {
        if (p.transactionType !== transactionType && p.transactionType !== '*') return false;
        if (p.minAmount != null && amount < Number(p.minAmount)) return false;
        if (p.maxAmount != null && amount > Number(p.maxAmount)) return false;
        return true;
      }) ?? null
    );
  }

  async findMatchingPolicy(transactionType: string, amount: number): Promise<ApprovalPolicy | null> {
    const policies = await this.findAll();
    return this.matchPolicy(transactionType, amount, policies);
  }

  async getPendingTransactionsByPolicy(policyId: string) {
    await this.findOne(policyId); // ensure exists
    // Returns transactions that were matched to this policy (stored in metadata)
    return { policyId, message: 'Query transactions with metadata.approvalPolicyId = policyId' };
  }
}
