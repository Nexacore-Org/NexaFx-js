import {
  Controller,
  Get,
  Post,
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
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { QuerySupportTicketsDto } from './dto/query-support-tickets.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('support')
@ApiBearerAuth()
@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('tickets')
  @ApiOperation({ summary: 'Create a new support ticket' })
  @ApiResponse({ status: 201, description: 'Ticket created successfully' })
  async createTicket(
    @Request() req,
    @Body() createTicketDto: CreateSupportTicketDto,
  ) {
    return this.supportService.createTicket(req.user.id, createTicketDto);
  }

  @Get('tickets')
  @ApiOperation({ summary: 'Get all tickets for the current user' })
  @ApiResponse({ status: 200, description: 'Returns user tickets' })
  async getUserTickets(@Request() req, @Query() query: QuerySupportTicketsDto) {
    return this.supportService.getUserTickets(req.user.id, query);
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get a specific ticket by ID' })
  @ApiResponse({ status: 200, description: 'Returns the ticket' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async getTicket(@Request() req, @Param('id') ticketId: string) {
    return this.supportService.getTicketById(ticketId, req.user.id);
  }

  @Post('tickets/:id/messages')
  @ApiOperation({ summary: 'Add a message to a ticket' })
  @ApiResponse({ status: 201, description: 'Message added successfully' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async addMessage(
    @Request() req,
    @Param('id') ticketId: string,
    @Body() createMessageDto: CreateSupportMessageDto,
  ) {
    return this.supportService.addMessage(
      ticketId,
      req.user.id,
      createMessageDto,
    );
  }
}