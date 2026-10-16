import { AdminService } from '../admin.service';

type Ctor = ConstructorParameters<typeof AdminService>;

export interface AdminServiceDeps {
  users: Ctor[0];
  transactions: Ctor[1];
  kyc: Ctor[2];
  tickets: Ctor[3];
  webhooks: Ctor[4];
  alerts: Ctor[5];
  approvals: Ctor[6];
  audit: Ctor[7];
}

/** Supplies every AdminService constructor argument by name; see makeTransactionsService. */
export function makeAdminService(
  overrides: { [K in keyof AdminServiceDeps]?: unknown } = {},
): AdminService {
  const d = (key: keyof AdminServiceDeps, fallback: unknown) =>
    (key in overrides ? overrides[key] : fallback) as never;

  return new AdminService(
    d('users', {}),
    d('transactions', {}),
    d('kyc', {}),
    d('tickets', {}),
    d('webhooks', {}),
    d('alerts', {}),
    d('approvals', {}),
    d('audit', { log: () => Promise.resolve() }),
  );
}
