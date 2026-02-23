import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { validateEnv } from "./env.validation";
import configuration from "./configuration";

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [configuration],
      // Expand environment variables in .env file
      expandVariables: true,
    }),
  ],
})
export class ConfigModule {}
