/**
 * PATCH: Add these fields to your existing Goal entity.
 *
 * src/goals/entities/goal.entity.ts
 *
 * Import additions:
 *   import { OneToMany } from 'typeorm';
 *   import { GoalContribution } from './goal-contribution.entity';
 */

// ── Round-up rule (nullable — null means disabled) ────────────────────────────

// @Column({ name: 'round_up_enabled', default: false })
// roundUpEnabled: boolean;
//
// /** Round up to nearest 1, 5, or 10 units of the wallet currency */
// @Column({ name: 'round_up_unit', type: 'int', nullable: true })
// roundUpUnit: number | null; // 1 | 5 | 10
//
// /** Wallet ID from which round-up amounts are drawn */
// @Column({ name: 'linked_wallet_id', nullable: true, type: 'uuid' })
// linkedWalletId: string | null;

// ── Milestone tracking ────────────────────────────────────────────────────────

// Bitmask: bit 0 = 25%, bit 1 = 50%, bit 2 = 75%, bit 3 = 100%
// @Column({ name: 'milestones_notified', type: 'int', default: 0 })
// milestonesNotified: number;

// ── Contributions relation ────────────────────────────────────────────────────

// @OneToMany(() => GoalContribution, (c) => c.goal, { cascade: ['insert'] })
// contributions: GoalContribution[];

// ── Current saved amount (maintained by service layer) ───────────────────────

// @Column({ name: 'current_amount', type: 'decimal', precision: 18, scale: 6, default: '0' })
// currentAmount: string;
//
// @Column({ name: 'target_amount', type: 'decimal', precision: 18, scale: 6 })
// targetAmount: string;
//
// @Column({ name: 'is_completed', default: false })
// isCompleted: boolean;
//
// @Column({ name: 'completed_at', nullable: true })
// completedAt: Date | null;
