import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { AdminRoleGuard } from '../../../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../../../common/guards/ip-allowlist.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { UserDeactivationService } from '../services/user-deactivation.service';
import { DeactivateUserDto, DeactivationHistoryQueryDto } from '../dto/user-deactivation.dto';

/** Same guard stack as the other admin routes (issue #1523). */
@Controller('admin/users/:id')
@UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
export class UserDeactivationController {
  constructor(private readonly service: UserDeactivationService) {}

  @Post('deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DeactivateUserDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.service.deactivate(id, dto, adminId);
  }

  @Post('reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser('id') adminId: string) {
    return this.service.reactivate(id, adminId);
  }

  @Get('deactivation-history')
  getHistory(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: DeactivationHistoryQueryDto) {
    return this.service.getHistory(id, query.page, query.limit);
  }
}
