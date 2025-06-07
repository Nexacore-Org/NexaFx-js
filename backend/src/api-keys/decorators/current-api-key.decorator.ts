import { createParamDecorator, type ExecutionContext } from "@nestjs/common"
import type { ApiKey } from "../entities/api-key.entity"

export const CurrentApiKey = createParamDecorator((data: unknown, ctx: ExecutionContext): ApiKey => {
  const request = ctx.switchToHttp().getRequest()
  return request.apiKey
})
