import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FxModule } from './modules/fx/fx-aggregator.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    FxModule,
  ],
})
export class AppModule {}
