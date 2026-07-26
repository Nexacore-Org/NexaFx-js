import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { UserDeactivationService } from '../services/user-deactivation.service';
import { DeactivateUserDto } from '../dto/user-deactivation.dto';

@Controller('admin/users/:id')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UserDeactivationController {
  constructor(private readonly service: UserDeactivationService) {}

  @Post('deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id') id: string, @Body() dto: DeactivateUserDto) {
    const adminId = 'system';
    return this.service.deactivate(id, dto, adminId);
  }

  @Post('reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id') id: string) {
    const adminId = 'system';
    return this.service.reactivate(id, adminId);
  }

  @Get('deactivation-history')
  getHistory(@Param('id') id: string) {
    return this.service.getHistory(id);
  }
}
