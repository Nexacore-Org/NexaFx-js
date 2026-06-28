import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CanaryToken, CanaryType } from './entities/canary-token.entity';
import { AbuseEvent } from './entities/abuse-event.entity';
import { v4 as uuidv4 } from 'uuid';

// Simulated structural cross-module handlers. Resolve pathways to your local setups.
class UsersService { async findSuperAdmins(): Promise<any[]> { return [{ id: 'adm_1', email: 'sa1@nexafx.com' }]; } }
class NotificationService { async notifyAdmin(id: string, msg: string): Promise<void> {} }
class AuditLogService { async log(event: string, meta: any): Promise<void> {} }

@Injectable()
export class CanaryService {
  private readonly logger = new Logger(CanaryService.name);

  constructor(
    @InjectRepository(CanaryToken) private readonly tokenRepo: Repository<CanaryToken>,
    @InjectRepository(AbuseEvent) private readonly abuseRepo: Repository<AbuseEvent>,
    private readonly usersService: UsersService,
    private readonly notifyService: NotificationService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Traps credentials checks on honeypot identities. 
   * CRITICAL constraint: Always throws 401 Unauthorized to conceal canary nature.
   */
  public async handleLoginAttempt(email: string, ipContext: string): Promise<void> {
    if (email === 'canary@nexafx-internal.com') {
      await this.triggerAlert(CanaryType.API_USER, email, `Login attempt detected from IP: ${ipContext}`);
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  /**
   * Checks runtime inputs against field and export honeypot patterns.
   */
  public async scanInputPayload(input: string, contextDescription: string): Promise<void> {
    if (!input) return;

    // Detect field traps: canary-{uuid}@nexafx-trap.com
    if (input.includes('@nexafx-trap.com')) {
      await this.triggerAlert(CanaryType.FIELD, input, `Scraping signature identified in: ${contextDescription}`);
    }

    // Detect export traps: CANARY-{uuid}
    if (input.includes('CANARY-')) {
      const match = input.match(/CANARY-[a-f0-9\-]+/i);
      if (match) {
        await this.triggerAlert(CanaryType.EXPORT, match[0], `Exfiltrated export transaction tag flagged in: ${contextDescription}`);
      }
    }
  }

  /**
   * Spawns data row records inline inside structural page list outputs.
   */
  public injectFieldCanary(userRows: any[]): any[] {
    const token = `canary-${uuidv4()}@nexafx-trap.com`;
    
    // Asynchronously save tracking record so it matches search matrices later
    this.registerDynamicToken(CanaryType.FIELD, token, 'Injected admin directory user honeyfield').catch(() => {});

    const fakeRow = {
      id: uuidv4(),
      email: token,
      username: 'canary_trap_node',
      isCanaryEnabled: false,
      createdAt: new Date(),
    };

    return [fakeRow, ...userRows];
  }

  /**
   * Injects an explicit CSV data row payload satisfying token verification rules.
   */
  public injectExportCanary(csvRows: string[]): string[] {
    const token = `CANARY-${uuidv4()}`;
    this.registerDynamicToken(CanaryType.EXPORT, token, 'Injected CSV spreadsheet row token').catch(() => {});
    
    const fakeCsvLine = `"${uuidv4()}","${token}","0.00001","XLM","PENDING","${new Date().toISOString()}"`;
    csvRows.push(fakeCsvLine);
    return csvRows;
  }

  public async getAllTokens(): Promise<CanaryToken[]> {
    return this.tokenRepo.find({ orderBy: { createdAt: 'DESC' } });
  }

  private async registerDynamicToken(type: CanaryType, token: string, desc: string): Promise<void> {
    const t = new CanaryToken();
    t.type = type;
    t.token = token;
    t.description = desc;
    await this.tokenRepo.save(t);
  }

  private async triggerAlert(type: CanaryType, tokenValue: string, details: string): Promise<void> {
    let token = await this.tokenRepo.findOne({ where: { token: tokenValue } });
    
    if (!token) {
      token = new CanaryToken();
      token.type = type;
      token.token = tokenValue;
      token.description = 'Dynamic contextual tracking record';
    }

    if (token.isTriggered) return; // Prevent alert spamming loops

    token.isTriggered = true;
    token.triggeredAt = new Date();
    token.triggeredBy = details;
    await this.tokenRepo.save(token);

    // Save formal abuse record tracking structures
    const abuse = new AbuseEvent();
    abuse.metadata = { type, token: tokenValue, details, timestamp: token.triggeredAt };
    await this.abuseRepo.save(abuse);

    // Emit critical audit events logs
    await this.auditLog.log('security.canary_triggered', abuse.metadata);

    // Instant multi-channel alert fan-out to all SUPER_ADMIN operators
    const admins = await this.usersService.findSuperAdmins();
    for (const admin of admins) {
      await this.notifyService.notifyAdmin(
        admin.id, 
        `CRITICAL ALERT: [${type}] Fraud Canary Trap Activated. Details: ${details}`
      );
    }
  }
}