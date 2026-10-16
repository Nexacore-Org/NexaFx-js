import { TransactionsService } from '../transactions.service';

type Ctor = ConstructorParameters<typeof TransactionsService>;

/** Named collaborators of {@link TransactionsService}, in constructor order. */
export interface TransactionsServiceDeps {
  txRepo: Ctor[0];
  dataSource: Ctor[1];
  wallets: Ctor[2];
  stellar: Ctor[3];
  config: Ctor[4];
  audit: Ctor[5];
  mail: Ctor[6];
  users: Ctor[7];
  events: Ctor[8];
  limits: Ctor[9];
  fees: Ctor[10];
  deactivation: Ctor[11];
  terms: Ctor[12];
}

/**
 * Builds a TransactionsService supplying *every* constructor argument. Tests
 * override only what they exercise by name; when the constructor changes, this
 * is the one place to update, and the compiler flags it (instead of specs
 * silently passing `undefined` for new collaborators).
 */
export function makeTransactionsService(
  overrides: { [K in keyof TransactionsServiceDeps]?: unknown } = {},
): TransactionsService {
  const d = (key: keyof TransactionsServiceDeps, fallback: unknown) =>
    (key in overrides ? overrides[key] : fallback) as never;

  return new TransactionsService(
    d('txRepo', {}),
    d('dataSource', {}),
    d('wallets', {}),
    d('stellar', {}),
    d('config', { get: () => undefined }),
    d('audit', { log: () => Promise.resolve() }),
    d('mail', {}),
    d('users', {}),
    d('events', { emit: () => true }),
    d('limits', { check: () => Promise.resolve(0), release: () => Promise.resolve() }),
    d('fees', { calculateFee: () => ({ feeAmount: 0, reason: 'none' }) }),
    d('deactivation', { isUserDeactivated: () => Promise.resolve(false) }),
    d('terms', { ensureAccepted: () => Promise.resolve() }),
  );
}
