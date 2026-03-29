import { getRepository } from "typeorm";
import { FxAlert } from "../entities/fx-alert.entity";
import { NotificationsGateway } from "../../web-sockets/notifications.gateway";

export class FxAlertService {
  private repo = getRepository(FxAlert);

  constructor(private readonly gateway: NotificationsGateway) {}

  async createAlert(userId: string, dto: { currencyPair: string; threshold: number; direction: "above" | "below"; expiresAt: Date }) {
    const alert = this.repo.create({ userId, ...dto });
    return this.repo.save(alert);
  }

  async listAlerts(userId: string) {
    const alerts = await this.repo.find({ where: { userId, expiresAt: MoreThan(new Date()) } });
    return alerts;
  }

  async evaluateAlerts(currentRates: Record<string, number>) {
    const alerts = await this.repo.find({ where: { expiresAt: MoreThan(new Date()) } });
    for (const alert of alerts) {
      const rate = currentRates[alert.currencyPair];
      if (!rate) continue;

      const triggered =
        (alert.direction === "above" && rate > alert.threshold) ||
        (alert.direction === "below" && rate < alert.threshold);

      if (triggered) {
        this.gateway.emitDashboardAlert({
          type: "fx.alert",
          userId: alert.userId,
          currencyPair: alert.currencyPair,
          rate,
          threshold: alert.threshold,
          direction: alert.direction,
        });
        await this.repo.delete(alert.id); // auto-expire after trigger
      }
    }
  }
}
