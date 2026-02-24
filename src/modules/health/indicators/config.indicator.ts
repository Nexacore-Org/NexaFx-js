import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ConfigHealthIndicator extends HealthIndicator {
  constructor(private configService: ConfigService) {
    super();
  }

  /**
   * Checks if configuration is properly loaded and valid
   * Returns health status based on configuration integrity
   */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Test that critical configuration values are present and valid
      const nodeEnv = this.configService.get<string>('app.nodeEnv');
      const dbHost = this.configService.get<string>('database.host');
      const dbPort = this.configService.get<number>('database.port');
      const dbName = this.configService.get<string>('database.database');
      const jwtSecret = this.configService.get<string>('jwt.secret');
      const walletKey = this.configService.get<string>('wallet.encryptionKey');

      // Validate that required values exist
      if (!nodeEnv || !dbHost || !dbPort || !dbName || !jwtSecret || !walletKey) {
        throw new Error('Missing required configuration values');
      }

      // Validate wallet encryption key format
      const hexRegex = /^[0-9a-fA-F]+$/;
      if (walletKey.length !== 64 || !hexRegex.test(walletKey)) {
        throw new Error('Invalid wallet encryption key format');
      }

      // Validate JWT secret length
      if (jwtSecret.length < 32) {
        throw new Error('JWT secret is too short');
      }

      // Validate database connection values
      if (dbPort < 1 || dbPort > 65535) {
        throw new Error('Invalid database port');
      }

      // Return healthy status
      return this.getStatus(key, true, {
        nodeEnv,
        dbHost,
        dbPort,
        dbName,
        jwtSecretLength: jwtSecret.length,
        walletKeyValid: true,
      });
    } catch (error) {
      // Return unhealthy status with error details
      throw new HealthCheckError('Configuration check failed', this.getStatus(key, false, { error: error.message }));
    }
  }

  /**
   * Gets detailed configuration information for verbose health checks
   */
  async getDetails(): Promise<Record<string, any>> {
    return {
      nodeEnv: this.configService.get<string>('app.nodeEnv'),
      port: this.configService.get<number>('app.port'),
      database: {
        host: this.configService.get<string>('database.host'),
        port: this.configService.get<number>('database.port'),
        database: this.configService.get<string>('database.database'),
      },
      jwt: {
        expiry: this.configService.get<number>('jwt.expiry'),
      },
      limits: {
        json: this.configService.get<number>('limits.json'),
        urlencoded: this.configService.get<number>('limits.urlencoded'),
      },
      rateLimit: {
        windowMs: this.configService.get<number>('rateLimit.windowMs'),
        maxRequests: this.configService.get<number>('rateLimit.maxRequests'),
      },
      isProduction: this.configService.get<boolean>('app.isProduction'),
      isDevelopment: this.configService.get<boolean>('app.isDevelopment'),
      isTest: this.configService.get<boolean>('app.isTest'),
    };
  }
}