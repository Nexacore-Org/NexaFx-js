import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';
import {
  SupportTicketsService,
  UpdateSupportTicketDto,
} from './support-tickets.service';
import {
  SupportTicketCategory,
  SupportTicketStatus,
} from './support-ticket.entity';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
    role?: string;
  };
}

@Controller('api/v1/support/tickets')
export class SupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Body()
    body: {
      subject: string;
      description: string;
      category: SupportTicketCategory;
      relatedEntityType?: string;
      relatedEntityId?: string;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.supportTicketsService.createTicket({
      userId: request.user?.sub ?? '',
      subject: body.subject,
      description: body.description,
      category: body.category,
      relatedEntityType: body.relatedEntityType,
      relatedEntityId: body.relatedEntityId,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.supportTicketsService.listTickets(
      request.user?.sub ?? '',
      request.user?.role === 'admin',
    );
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { status: SupportTicketStatus },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.supportTicketsService.updateTicket(id, {
      status: body.status,
      adminId: request.user?.sub ?? '',
    } satisfies UpdateSupportTicketDto);
  }
}
