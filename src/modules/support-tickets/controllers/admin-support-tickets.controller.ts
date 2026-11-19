import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { Role } from '../../../auth/enums/role.enum';
import { ListSupportTicketsDto } from '../dto/list-support-tickets.dto';
import { UpdateTicketStatusDto } from '../dto/update-ticket-status.dto';
import { SupportTicketsService } from '../services/support-tickets.service';

interface AuthenticatedRequest {
  user?: { id?: string; sub?: string };
}

/** Agent queue: staff-only access to tickets across all customers. */
@ApiTags('Support Tickets (admin)')
@ApiBearerAuth('access-token')
@Controller('admin/support-tickets')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN, Role.COMPLIANCE)
export class AdminSupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Get()
  @ApiOperation({ summary: 'List the support ticket queue' })
  @ApiOkResponse({ description: 'Paginated list of tickets' })
  async findAll(@Query(ValidationPipe) dto: ListSupportTicketsDto) {
    return this.supportTicketsService.findAllForStaff(dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change a support ticket status (staff only)' })
  @ApiOkResponse({ description: 'Ticket status changed' })
  async changeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(ValidationPipe) dto: UpdateTicketStatusDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const actorId = req.user?.id ?? req.user?.sub ?? '';
    return this.supportTicketsService.changeStatus(id, dto.status, actorId);
  }

  @Post(':id/reopen')
  @ApiOperation({ summary: 'Reopen a recently closed ticket (staff only)' })
  @ApiOkResponse({ description: 'Ticket reopened' })
  async reopen(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const actorId = req.user?.id ?? req.user?.sub ?? '';
    return this.supportTicketsService.reopen(id, actorId);
  }
}
