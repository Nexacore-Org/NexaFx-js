import { EncryptedColumnTransformer } from "../typeorm/encrypted-column.transformer"
import { EncryptedJsonTransformer } from "../typeorm/encrypted-json.transformer"
import { Column, type ColumnOptions } from "typeorm"

/**
 * Factory function to create an encrypted column decorator
 * @param encryptionService The encryption service instance
 */
export function createEncryptedColumnDecorator(encryptionService: any) {
  /**
   * Decorator for encrypted string columns
   */
  function EncryptedColumn(options?: ColumnOptions): PropertyDecorator {
    return Column({
      ...options,
      type: "text",
      transformer: new EncryptedColumnTransformer(encryptionService, "string"),
    })
  }

  /**
   * Decorator for encrypted number columns
   */
  function EncryptedNumberColumn(options?: ColumnOptions): PropertyDecorator {
    return Column({
      ...options,
      type: "text",
      transformer: new EncryptedColumnTransformer(encryptionService, "number"),
    })
  }

  /**
   * Decorator for encrypted boolean columns
   */
  function EncryptedBooleanColumn(options?: ColumnOptions): PropertyDecorator {
    return Column({
      ...options,
      type: "text",
      transformer: new EncryptedColumnTransformer(encryptionService, "boolean"),
    })
  }

  /**
   * Decorator for encrypted JSON columns
   */
  function EncryptedJsonColumn(options?: ColumnOptions): PropertyDecorator {
    return Column({
      ...options,
      type: "text",
      transformer: new EncryptedJsonTransformer(encryptionService),
    })
  }

  return {
    EncryptedColumn,
    EncryptedNumberColumn,
    EncryptedBooleanColumn,
    EncryptedJsonColumn,
  }
}
