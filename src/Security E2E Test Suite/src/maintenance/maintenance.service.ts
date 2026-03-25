import { Injectable } from '@nestjs/common';

@Injectable()
export class MaintenanceService {
  private config: any = { enabled: false, message: '' };

  getStatus() {
    return { status: 'ok', maintenance: this.config };
  }

  updateConfig(config: any) {
    this.config = { ...this.config, ...config };
    return { updated: true, config: this.config };
  }
}
