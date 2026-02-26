import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { WalletRiskScoringService } from "./wallet-risk-scoring.service";

@Injectable()
export class WalletRiskJobService {
  private readonly logger = new Logger(WalletRiskJobService.name);

  constructor(
    private walletRiskScoringService: WalletRiskScoringService,
    // Inject your Wallet repository to get all wallet IDs
    // @InjectRepository(Wallet)
    // private walletRepo: Repository<Wallet>,
  ) {}

  // Run every hour
  @Cron(CronExpression.EVERY_HOUR)
  async calculateAllWalletRiskScores(): Promise<void> {
    this.logger.log("Starting periodic risk score calculation job");

    try {
      // Get all wallet IDs - replace with actual query
      const walletIds = await this.getAllWalletIds();

      this.logger.log(`Processing ${walletIds.length} wallets`);

      for (const walletId of walletIds) {
        try {
          await this.walletRiskScoringService.calculateRiskScore(walletId);
        } catch (error) {
          this.logger.error(
            `Failed to calculate risk for wallet ${walletId}:`,
            error,
          );
        }
      }

      this.logger.log("Periodic risk score calculation job completed");
    } catch (error) {
      this.logger.error("Error in risk score calculation job:", error);
    }
  }

  private async getAllWalletIds(): Promise<string[]> {
    // Mock implementation - replace with actual wallet query
    // const wallets = await this.walletRepo.find({ select: ['id'] });
    // return wallets.map(w => w.id);
    return [];
  }
}
