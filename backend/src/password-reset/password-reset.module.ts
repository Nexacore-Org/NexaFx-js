import { Module } from "@nestjs/common"
import { JwtModule } from "@nestjs/jwt"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { PasswordResetController } from "./password-reset.controller"
import { PasswordResetService } from "./password-reset.service"
import { EmailService } from "./email.service"

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: configService.get<string>("PASSWORD_RESET_TOKEN_EXPIRY", "1h"),
        },
      }),
    }),
    ConfigModule,
  ],
  controllers: [PasswordResetController],
  providers: [PasswordResetService, EmailService],
  exports: [PasswordResetService],
})
export class PasswordResetModule {}
