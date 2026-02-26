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
import { Public } from "../auth/decorators/public.decorator";

@Controller("webhooks")
@UseGuards(JwtAuthGuard, RolesGuard)
export class WebhooksController {
  // Public endpoint for receiving webhook events
  @Post("events/:id")
  @Public()
  receiveEvent(@Param("id") id: string, @Body() payload: any) {
    return { message: "Webhook event received" };
  }

  // Protected configuration endpoints
  @Get("config")
  @Roles("admin")
  getConfig() {
    return { message: "Get webhook configurations" };
  }

  @Post("config")
  @Roles("admin")
  createConfig(@Body() createDto: any) {
    return { message: "Create webhook configuration" };
  }

  @Put("config/:id")
  @Roles("admin")
  updateConfig(@Param("id") id: string, @Body() updateDto: any) {
    return { message: `Update webhook config ${id}` };
  }

  @Delete("config/:id")
  @Roles("admin")
  deleteConfig(@Param("id") id: string) {
    return { message: `Delete webhook config ${id}` };
  }
}
