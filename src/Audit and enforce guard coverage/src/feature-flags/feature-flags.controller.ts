import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("feature-flags")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class FeatureFlagsController {
  @Get()
  findAll() {
    return { message: "Get all feature flags" };
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return { message: `Get feature flag ${id}` };
  }

  @Post()
  create(@Body() createDto: any) {
    return { message: "Create feature flag" };
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() updateDto: any) {
    return { message: `Update feature flag ${id}` };
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return { message: `Delete feature flag ${id}` };
  }
}
