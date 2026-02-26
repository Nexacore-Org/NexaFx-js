import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("api-usage")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class ApiUsageController {
  @Get("logs")
  getLogs(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return { message: "Get API usage logs" };
  }

  @Get("stats")
  getStats() {
    return { message: "Get API usage statistics" };
  }
}
