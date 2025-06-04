import { Injectable } from '@nestjs/common';

@Injectable()
export class MaintenanceService {
  private isMaintenanceMode = false;
  private whitelistedIPs: string[] = ['127.0.0.1', '::1']; // Add your whitelisted IPs here

  toggleMaintenanceMode(): { status: string; maintenanceMode: boolean } {
    this.isMaintenanceMode = !this.isMaintenanceMode;
    return {
      status: 'success',
      maintenanceMode: this.isMaintenanceMode,
    };
  }

  getMaintenanceStatus(): boolean {
    return this.isMaintenanceMode;
  }

  isIPWhitelisted(ip: string): boolean {
    return this.whitelistedIPs.includes(ip);
  }

  getWhitelistedIPs(): string[] {
    return [...this.whitelistedIPs];
  }

  addWhitelistedIP(ip: string): void {
    if (!this.whitelistedIPs.includes(ip)) {
      this.whitelistedIPs.push(ip);
    }
  }

  removeWhitelistedIP(ip: string): void {
    this.whitelistedIPs = this.whitelistedIPs.filter((item) => item !== ip);
  }
}