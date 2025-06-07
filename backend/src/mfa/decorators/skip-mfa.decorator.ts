import { SetMetadata } from "@nestjs/common"

export const SkipMfa = () => SetMetadata("skipMfa", true)
