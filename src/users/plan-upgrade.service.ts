// User plan upgrade service
import { Injectable } from '@nestjs/common';

enum UserPlan {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PREMIUM = 'PREMIUM',
  ENTERPRISE = 'ENTERPRISE',
}

const PlanBenefits = {
  FREE: { transactionLimit: 10, beneficiaries: 1, apiAccess: false },
  BASIC: { transactionLimit: 100, beneficiaries: 5, apiAccess: true },
  PREMIUM: { transactionLimit: 1000, beneficiaries: 20, apiAccess: true },
  ENTERPRISE: { transactionLimit: Infinity, beneficiaries: Infinity, apiAccess: true },
};

@Injectable()
export class PlanUpgradeService {
  getPlanBenefits(plan: UserPlan): any {
    return PlanBenefits[plan];
  }

  upgradePlan(userId: string, newPlan: UserPlan): Promise<void> {
    // Update user plan in database
    return Promise.resolve();
  }

  checkPlanBenefit(plan: UserPlan, feature: string): boolean {
    const benefits = PlanBenefits[plan];
    return benefits && (benefits as any)[feature];
  }
}
