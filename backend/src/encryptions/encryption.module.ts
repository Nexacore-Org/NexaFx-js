import { Module, type DynamicModule, type Provider, Global } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import { EncryptionService } from "./encryption.service"
import { KeyRotationService } from "./key-management/key-rotation.service"
import { EncryptionKey } from "./key-management/encryption-key.entity"
import { createEncryptedColumnDecorator } from "./decorators/encrypted-column.decorator"

export interface EncryptionModuleOptions {
  useKeyRotation?: boolean
}

@Global()
@Module({})
export class EncryptionModule {
  static forRoot(options: EncryptionModuleOptions = {}): DynamicModule {
    const imports = [ConfigModule]
    const providers: Provider[] = [
      {
        provide: EncryptionService,
        useFactory: (configService: ConfigService) => {
          return new EncryptionService(configService)
        },
        inject: [ConfigService],
      },
    ]
    const exports = [EncryptionService]

    // Add key rotation if enabled
    if (options.useKeyRotation) {
      imports.push(TypeOrmModule.forFeature([EncryptionKey]))
      providers.push(KeyRotationService)
      exports.push(KeyRotationService)
    }

    // Add encrypted column decorators factory
    providers.push({
      provide: "ENCRYPTED_COLUMN_DECORATORS",
      useFactory: (encryptionService: EncryptionService) => {
        return createEncryptedColumnDecorator(encryptionService)
      },
      inject: [EncryptionService],
    })
    exports.push("ENCRYPTED_COLUMN_DECORATORS")

    return {
      module: EncryptionModule,
      imports,
      providers,
      exports,
    }
  }
}
