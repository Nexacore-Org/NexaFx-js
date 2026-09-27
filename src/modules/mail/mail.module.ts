// Starting skeleton for a second, distinct mail module (issue #1269).
// NOTE: src/app.module.ts already imports a MailModule as
// `UpstreamMailModule` (the existing, working src/mail tree) -- the
// issue's premise that app.module.ts imports and fails to resolve a
// modules/mail MailModule does not match the current main branch. Named
// ModulesMailModule here to avoid any future naming collision with the
// existing src/mail tree's MailModule if this is ever wired in.
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  providers: [],
  controllers: [],
  exports: [],
})
export class ModulesMailModule {}
