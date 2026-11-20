import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { Role } from '../../../auth/enums/role.enum';
import { SupportTicketsService } from '../services/support-tickets.service';
import { CreateSupportTicketDto } from '../dto/create-support-ticket.dto';
import { ListSupportTicketsDto } from '../dto/list-support-tickets.dto';
import { AssignTicketDto } from '../dto/assign-ticket.dto';
import { CreateTicketMessageDto } from '../dto/create-ticket-message.dto';
import { ListTicketMessagesDto } from '../dto/list-ticket-messages.dto';

interface AuthenticatedRequest {
  user?: { id?: string; sub?: string };
}

@ApiTags('Support Tickets')
@ApiBearerAuth('access-token')
@Controller('support-tickets')
@UseGuards(JwtAuthGuard)
export class SupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a support ticket' })
  @ApiCreatedResponse({ description: 'Support ticket created' })
  async create(
    @Request() req: AuthenticatedRequest,
    @Body(ValidationPipe) dto: CreateSupportTicketDto,
  ) {
    const userId = req.user?.id ?? req.user?.sub ?? '';
    return this.supportTicketsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List support tickets' })
  @ApiOkResponse({ description: 'Paginated list of support tickets' })
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query(ValidationPipe) dto: ListSupportTicketsDto,
  ) {
    const userId = req.user?.id ?? req.user?.sub ?? '';
    return this.supportTicketsService.findAll(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a support ticket by ID' })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiOkResponse({ description: 'Support ticket details' })
  async findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    const userId = req.user?.id ?? req.user?.sub ?? '';
    return this.supportTicketsService.findOne(id, userId);
  }

  @Patch(':id/assign')
  @Roles(Role.ADMIN, Role.COMPLIANCE)
  @ApiOperation({ summary: 'Assign a support ticket to a staff member' })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiOkResponse({ description: 'Ticket assigned' })
  async assign(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: AssignTicketDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const actorId = req.user?.id ?? req.user?.sub ?? '';
    return this.supportTicketsService.assign(
      id,
      dto.assignedTo,
      dto.status,
      actorId,
    );
  }

  /** Owners may close their own ticket; reassignment and other statuses are staff-only. */
  @Patch(':id/close')
  @ApiOperation({ summary: 'Close your own support ticket' })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiOkResponse({ description: 'Ticket closed' })
  async close(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    const userId = req.user?.id ?? req.user?.sub ?? '';
    return this.supportTicketsService.close(id, userId);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a message to a support ticket' })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiCreatedResponse({ description: 'Message added' })
  async addMessage(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Body(ValidationPipe) dto: CreateTicketMessageDto,
  ) {
    const userId = req.user?.id ?? req.user?.sub ?? '';
    return this.supportTicketsService.addMessage(id, userId, dto.message);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get messages for a support ticket' })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiOkResponse({ description: 'Paginated list of messages' })
  async getMessages(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Query(ValidationPipe) dto: ListTicketMessagesDto,
  ) {
    const userId = req.user?.id ?? req.user?.sub ?? '';
    return this.supportTicketsService.getMessages(id, userId, dto);
  }
}
