import { Injectable, Logger } from "@nestjs/common";

export interface LoginMetadata {
  userId: string;
  ip: string;
  userAgent: string;
  timestamp: Date;
}

@Injectable()
export class LoginMetadataService {
  private readonly logger = new Logger(LoginMetadataService.name);
  private logins: LoginMetadata[] = [];

  recordLogin(userId: string, ip: string, userAgent: string) {
    const entry: LoginMetadata = {
      userId,
      ip,
      userAgent,
      timestamp: new Date(),
    };
    this.logins.push(entry);
    this.logger.log(`Login recorded: ${userId} from IP ${ip}, UA ${userAgent}`);
  }

  getUserLogins(userId: string): LoginMetadata[] {
    return this.logins.filter((l) => l.userId === userId);
  }
}
