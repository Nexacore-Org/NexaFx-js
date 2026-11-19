import { Controller, Get, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt.guard';
import { AdminRoleGuard } from '../../../common/guards/admin-role.guard';
import { ListSupportTicketsDto } from '../dto/list-support-tickets.dto';
import { SupportTicketsService } from '../services/support-tickets.service';

/** Agent queue: staff-only access to tickets across all customers. */
@ApiTags('Support Tickets (admin)')
@ApiBearerAuth('access-token')
@Controller('admin/support-tickets')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class AdminSupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Get()
  @ApiOperation({ summary: 'List the support ticket queue' })
  @ApiOkResponse({ description: 'Paginated list of tickets' })
  async findAll(@Query(ValidationPipe) dto: ListSupportTicketsDto) {
    return this.supportTicketsService.findAllForStaff(dto);
  }
}
