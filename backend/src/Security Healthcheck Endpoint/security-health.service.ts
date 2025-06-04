import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SecurityHealthService {
  private readonly logger = new Logger(SecurityHealthService.name);

  getSecurityHealth() {
    const envLoaded = this.checkEnvLoaded();
    const httpsEnabled = this.checkHttpsEnabled();
    const corsConfigured = this.checkCorsConfigured();
    const dbEncrypted = this.checkDbEncryption();

    const allHealthy = envLoaded && httpsEnabled && corsConfigured && dbEncrypted;

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      details: {
        envLoaded,
        httpsEnabled,
        corsConfigured,
        dbEncrypted,
      },
    };
  }

  private checkEnvLoaded(): boolean {
    const requiredVars = ['NODE_ENV', 'DB_HOST', 'DB_PASSWORD'];
    return requiredVars.every((key) => process.env[key]);
  }

  private checkHttpsEnabled(): boolean {
    // Usually determined by configuration or env flag
    return process.env.HTTPS === 'true';
  }

  private checkCorsConfigured(): boolean {
    // Example: CORS_ORIGINS set
    return !!process.env.CORS_ORIGINS;
  }

  private checkDbEncryption(): boolean {
    // Custom check: if database encryption is enabled
    return process.env.DB_ENCRYPTION === 'true';
  }
}
