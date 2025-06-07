import { Module } from "@nestjs/common"
import { PassportModule } from "@nestjs/passport"
import { JwtModule } from "@nestjs/jwt"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { SocialAuthController } from "./social-auth.controller"
import { SocialAuthService } from "./social-auth.service"
import { GoogleStrategy } from "./strategies/google.strategy"
import { FacebookStrategy } from "./strategies/facebook.strategy"
import { JwtStrategy } from "./strategies/jwt.strategy"

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: configService.get<string>("JWT_EXPIRATION", "1d"),
        },
      }),
    }),
    ConfigModule,
  ],
  controllers: [SocialAuthController],
  providers: [SocialAuthService, GoogleStrategy, FacebookStrategy, JwtStrategy],
  exports: [SocialAuthService],
})
export class SocialAuthModule {}
