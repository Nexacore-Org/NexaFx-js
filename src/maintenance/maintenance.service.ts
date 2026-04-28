import { Injectable } from '@nestjs/common';

export interface MaintenanceConfig {
  enabled: boolean;
  message?: string;
  updatedAt: Date;
}

@Injectable()
export class MaintenanceService {
  private config: MaintenanceConfig = {
    enabled: false,
    message: 'System under maintenance',
    updatedAt: new Date(),
  };

  getConfig(): MaintenanceConfig {
    return this.config;
  }

  updateConfig(update: Partial<MaintenanceConfig>): MaintenanceConfig {
    this.config = {
      ...this.config,
      ...update,
      updatedAt: new Date(),
    };

    return this.config;
  }
}