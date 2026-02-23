import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Example service showing how to use validated configuration
 * throughout your application
 */
@Injectable()
export class DatabaseService {
  constructor(private configService: ConfigService) {}

  getConnectionConfig() {
    // Type-safe access to validated config
    return {
      host: this.configService.get<string>("database.host"),
      port: this.configService.get<number>("database.port"),
      username: this.configService.get<string>("database.username"),
      password: this.configService.get<string>("database.password"),
      database: this.configService.get<string>("database.database"),
      ssl: this.configService.get<boolean>("database.ssl"),
    };
  }
}

@Injectable()
export class JwtService {
  constructor(private configService: ConfigService) {}

  getJwtConfig() {
    return {
      secret: this.configService.get<string>("jwt.secret"),
      expiry: this.configService.get<number>("jwt.expiry"),
    };
  }
}

@Injectable()
export class WalletService {
  constructor(private configService: ConfigService) {}

  getEncryptionKey(): string {
    return this.configService.get<string>("wallet.encryptionKey");
  }
}

@Injectable()
export class ExternalApiService {
  constructor(private configService: ConfigService) {}

  getApiConfig() {
    return {
      key: this.configService.get<string>("externalApi.key"),
      url: this.configService.get<string>("externalApi.url"),
    };
  }
}

@Injectable()
export class MailService {
  constructor(private configService: ConfigService) {}

  getMailConfig() {
    return {
      host: this.configService.get<string>("mail.host"),
      port: this.configService.get<number>("mail.port"),
      user: this.configService.get<string>("mail.user"),
      password: this.configService.get<string>("mail.password"),
      from: this.configService.get<string>("mail.from"),
    };
  }
}
