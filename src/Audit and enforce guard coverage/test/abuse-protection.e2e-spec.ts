import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "../src/auth/auth.service";
import { AccountLockGuard } from "../src/auth/account-lock.guard";
import { TransactionLimitService } from "../src/transactions/transaction-limit.service";
import { TransactionLimitGuard } from "../src/transactions/transaction-limit.guard";
import { TransferCapService } from "../src/transactions/transfer-cap.service";
import { TransferCapGuard } from "../src/transactions/transfer-cap.guard";
import { LoginMetadataService } from "../src/auth/login-metadata.service";
import { SessionMetadataService } from "../src/auth/session-metadata.service";
import { DeviceAwarenessService } from "../src/auth/device-awareness.service";
import { HighRiskTransactionService } from "../src/transactions/high-risk-transaction.service";
import { AuditLogService } from "../src/audit/audit-log.service";

describe("Abuse Protection Integration", () => {
  let authService: AuthService;
  let accountLockGuard: AccountLockGuard;
  let transactionLimitService: TransactionLimitService;
  let transactionLimitGuard: TransactionLimitGuard;
  let transferCapService: TransferCapService;
  let transferCapGuard: TransferCapGuard;
  let loginMetadataService: LoginMetadataService;
  let sessionMetadataService: SessionMetadataService;
  let deviceAwarenessService: DeviceAwarenessService;
  let highRiskTransactionService: HighRiskTransactionService;
  let auditLogService: AuditLogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        AccountLockGuard,
        TransactionLimitService,
        TransactionLimitGuard,
        TransferCapService,
        TransferCapGuard,
        LoginMetadataService,
        SessionMetadataService,
        DeviceAwarenessService,
        HighRiskTransactionService,
        AuditLogService,
      ],
    }).compile();
    authService = module.get(AuthService);
    accountLockGuard = module.get(AccountLockGuard);
    transactionLimitService = module.get(TransactionLimitService);
    transactionLimitGuard = module.get(TransactionLimitGuard);
    transferCapService = module.get(TransferCapService);
    transferCapGuard = module.get(TransferCapGuard);
    loginMetadataService = module.get(LoginMetadataService);
    sessionMetadataService = module.get(SessionMetadataService);
    deviceAwarenessService = module.get(DeviceAwarenessService);
    highRiskTransactionService = module.get(HighRiskTransactionService);
    auditLogService = module.get(AuditLogService);
  });

  it("should lock account after failed logins", () => {
    const userId = "user1";
    for (let i = 0; i < 5; i++) {
      authService.recordFailedLogin(userId);
    }
    expect(authService.isAccountLocked(userId)).toBe(true);
  });

  it("should enforce transaction rate limits", () => {
    const userId = "user2";
    for (let i = 0; i < 11; i++) {
      transactionLimitService.recordTransaction(userId);
    }
    expect(transactionLimitService.isRateLimited(userId)).toBe(true);
  });

  it("should block transfer above cap", () => {
    expect(transferCapService.isTransferAllowed(20000)).toBe(false);
  });

  it("should record login metadata", () => {
    loginMetadataService.recordLogin("user3", "127.0.0.1", "UA");
    const logins = loginMetadataService.getUserLogins("user3");
    expect(logins.length).toBe(1);
  });

  it("should detect new device", () => {
    expect(deviceAwarenessService.isNewDevice("user4", "dev1")).toBe(true);
    deviceAwarenessService.recordDevice("user4", "dev1");
    expect(deviceAwarenessService.isNewDevice("user4", "dev1")).toBe(false);
  });

  it("should flag high-risk transaction", () => {
    deviceAwarenessService.recordDevice("user5", "dev2");
    expect(highRiskTransactionService.isHighRisk("user5", "dev3", 6000)).toBe(true);
  });

  it("should log audit actions", () => {
    auditLogService.log("user6", "account_lock", "Locked for abuse");
    const logs = auditLogService.getUserLogs("user6");
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe("account_lock");
  });
});
