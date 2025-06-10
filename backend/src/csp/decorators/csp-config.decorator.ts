import { SetMetadata } from "@nestjs/common"

export const CspConfig = (config: string) => SetMetadata("cspConfig", config)
