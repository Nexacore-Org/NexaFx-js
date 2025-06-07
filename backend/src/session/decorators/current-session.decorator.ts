import { createParamDecorator, type ExecutionContext } from "@nestjs/common"
import type { SessionData } from "../session.service"

export const CurrentSession = createParamDecorator((data: unknown, ctx: ExecutionContext): SessionData => {
  const request = ctx.switchToHttp().getRequest()
  return request.session
})
