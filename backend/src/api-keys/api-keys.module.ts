import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { ApiKeysService } from "./api-keys.service"
import { ApiKeysController } from "./api-keys.controller"
import { ApiKey } from "./entities/api-key.entity"
import { ApiKeyGuard } from "./guards/api-key.guard"

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey])],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyGuard],
  exports: [ApiKeysService, ApiKeyGuard],
})
export class ApiKeysModule {}
