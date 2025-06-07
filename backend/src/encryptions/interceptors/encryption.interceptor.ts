import { Injectable, type NestInterceptor, type ExecutionContext, type CallHandler } from "@nestjs/common"
import type { Observable } from "rxjs"
import { map } from "rxjs/operators"
import type { EncryptionService } from "../encryption.service"

/**
 * Interceptor that can automatically encrypt/decrypt data in HTTP requests and responses
 */
@Injectable()
export class EncryptionInterceptor implements NestInterceptor {
  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly options: {
      encryptResponse?: boolean
      decryptRequest?: boolean
      fieldsToEncrypt?: string[]
      fieldsToDecrypt?: string[]
    } = {},
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()

    // Decrypt request body fields if configured
    if (this.options.decryptRequest && request.body) {
      this.processObject(request.body, this.options.fieldsToDecrypt, (value) => {
        try {
          const encryptedData = JSON.parse(value)
          return this.encryptionService.decrypt(encryptedData)
        } catch (e) {
          return value // Return original value if decryption fails
        }
      })
    }

    // Process the response
    return next.handle().pipe(
      map((data) => {
        // Encrypt response fields if configured
        if (this.options.encryptResponse && data) {
          this.processObject(data, this.options.fieldsToEncrypt, (value) => {
            const encrypted = this.encryptionService.encrypt(value)
            return JSON.stringify(encrypted)
          })
        }
        return data
      }),
    )
  }

  private processObject(obj: any, fields: string[] | undefined, processor: (value: any) => any) {
    if (!obj || typeof obj !== "object") {
      return
    }

    // If fields are specified, only process those fields
    if (fields && fields.length > 0) {
      for (const field of fields) {
        if (obj[field] !== undefined) {
          obj[field] = processor(obj[field])
        }
      }
    } else {
      // Otherwise process all string fields
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key]
          if (typeof value === "string") {
            obj[key] = processor(value)
          } else if (typeof value === "object" && value !== null) {
            this.processObject(value, undefined, processor)
          }
        }
      }
    }
  }
}
