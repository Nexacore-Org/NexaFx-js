import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  try {
    const app = await NestFactory.create(AppModule);
    const configService = app.get(ConfigService);

    // Log non-sensitive configuration
    logger.log("Application configuration loaded successfully");
    logger.log(`Environment: ${configService.get("app.nodeEnv")}`);
    logger.log(`Port: ${configService.get("app.port")}`);
    logger.log(`Database Host: ${configService.get("database.host")}`);
    logger.log(`Mail Host: ${configService.get("mail.host")}`);

    // Mask sensitive values
    logger.log(`JWT Secret: ${maskSensitive(configService.get("jwt.secret"))}`);
    logger.log(
      `DB Password: ${maskSensitive(configService.get("database.password"))}`,
    );
    logger.log(
      `Wallet Key: ${maskSensitive(configService.get("wallet.encryptionKey"))}`,
    );
    logger.log(
      `External API Key: ${maskSensitive(configService.get("externalApi.key"))}`,
    );
    logger.log(
      `Mail Password: ${maskSensitive(configService.get("mail.password"))}`,
    );

    const port = configService.get("app.port");
    await app.listen(port);

    logger.log(`Application is running on: http://localhost:${port}`);
  } catch (error) {
    logger.error("Failed to start application", error.message);
    process.exit(1);
  }
}

/**
 * Masks sensitive values for logging
 * Shows first 4 and last 4 characters
 */
function maskSensitive(value: string): string {
  if (!value || value.length <= 8) {
    return "****";
  }
  return `${value.substring(0, 4)}${"*".repeat(value.length - 8)}${value.substring(value.length - 4)}`;
}

bootstrap();
