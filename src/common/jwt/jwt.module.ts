import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '../../config/config.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('jwt.secret');
        if (!secret) {
          throw new Error(
            'JWT_SECRET is not set — refusing to start without a signing key',
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn: `${config.get<number>('jwt.expiry') ?? 3600}s`,
          },
        };
      },
    }),
  ],
  exports: [JwtModule],
})
export class SharedJwtModule {}
