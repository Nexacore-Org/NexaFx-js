import { Controller, Get, Post, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("retry-jobs")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "operator")
export class RetryJobsController {
  @Get()
  findAll() {
    return { message: "Get all retry jobs" };
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return { message: `Get retry job ${id}` };
  }

  @Post(":id/retry")
  retry(@Param("id") id: string) {
    return { message: `Retry job ${id}` };
  }
}
