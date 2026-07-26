import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { EndpointRateLimitService } from '../services/endpoint-rate-limit.service';
import {
  CreateEndpointRateLimitDto,
  UpdateEndpointRateLimitDto,
} from '../dto/endpoint-rate-limit.dto';

@Controller('admin/rate-limits/endpoint')
@UseGuards(AdminGuard)
export class EndpointRateLimitController {
  constructor(private readonly service: EndpointRateLimitService) {}

  @Get()
  list() {
    return this.service.listConfigs();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateEndpointRateLimitDto) {
    return this.service.createConfig(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEndpointRateLimitDto) {
    return this.service.updateConfig(id, dto);
  }

  @Get('defaults')
  getDefaults() {
    return this.service.getDefaultConfigs();
  }
}
