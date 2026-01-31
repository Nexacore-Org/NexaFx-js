import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SupportService } from './support.service';
import { UpdateSupportTicketDto } from './dto/update-support-ticket.dto';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { QuerySupportTicketsDto } from './dto/query-support-tickets.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('admin/support')
@ApiBearerAuth()
@Controller('admin/support')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'support')
export class AdminSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('tickets')
  @ApiOperation({ summary: 'Get all support tickets (admin)' })
  @ApiResponse({ status: 200, description: 'Returns all tickets' })
  async getAllTickets(@Query() query: QuerySupportTicketsDto) {
    return this.supportService.getAllTickets(query);
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get a specific ticket by ID (admin)' })
  @ApiResponse({ status: 200, description: 'Returns the ticket with all messages' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async getTicket(@Param('id') ticketId: string) {
    return this.supportService.getTicketByIdAdmin(ticketId);
  }

  @Patch('tickets/:id')
  @ApiOperation({ summary: 'Update ticket status or assignment (admin)' })
  @ApiResponse({ status: 200, description: 'Ticket updated successfully' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async updateTicket(
    @Param('id') ticketId: string,
    @Body() updateTicketDto: UpdateSupportTicketDto,
  ) {
    return this.supportService.updateTicket(ticketId, updateTicketDto);
  }

  @Post('tickets/:id/messages')
  @ApiOperation({ summary: 'Add a message to a ticket (admin)' })
  @ApiResponse({ status: 201, description: 'Message added successfully' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async addMessage(
    @Request() req,
    @Param('id') ticketId: string,
    @Body() createMessageDto: CreateSupportMessageDto,
  ) {
    return this.supportService.addMessageAdmin(
      ticketId,
      req.user.id,
      createMessageDto,
    );
  }

  @Delete('tickets/:id')
  @ApiOperation({ summary: 'Delete a ticket (admin)' })
  @ApiResponse({ status: 200, description: 'Ticket deleted successfully' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async deleteTicket(@Param('id') ticketId: string) {
    await this.supportService.deleteTicket(ticketId);
    return { message: 'Ticket deleted successfully' };
  }
}