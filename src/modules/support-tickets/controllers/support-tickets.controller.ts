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
import { SupportTicketsService } from '../services/support-tickets.service';
import { CreateSupportTicketDto } from '../dto/create-support-ticket.dto';
import { ListSupportTicketsDto } from '../dto/list-support-tickets.dto';
import { AssignTicketDto } from '../dto/assign-ticket.dto';
import { CreateTicketMessageDto } from '../dto/create-ticket-message.dto';

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
  async create(@Request() req: any, @Body(ValidationPipe) dto: CreateSupportTicketDto) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.supportTicketsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List support tickets' })
  @ApiOkResponse({ description: 'Paginated list of support tickets' })
  async findAll(@Request() req: any, @Query(ValidationPipe) dto: ListSupportTicketsDto) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.supportTicketsService.findAll(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a support ticket by ID' })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiOkResponse({ description: 'Support ticket details' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.supportTicketsService.findOne(id, userId);
  }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Assign a support ticket to an agent' })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiOkResponse({ description: 'Ticket assigned' })
  async assign(@Param('id') id: string, @Request() req: any, @Body(ValidationPipe) dto: AssignTicketDto) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.supportTicketsService.assign(id, dto.assignedTo, dto.status as any, userId);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a message to a support ticket' })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiCreatedResponse({ description: 'Message added' })
  async addMessage(
    @Param('id') id: string,
    @Request() req: any,
    @Body(ValidationPipe) dto: CreateTicketMessageDto,
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.supportTicketsService.addMessage(id, userId, dto.message);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get messages for a support ticket' })
  @ApiParam({ name: 'id', description: 'Support ticket UUID' })
  @ApiOkResponse({ description: 'List of messages' })
  async getMessages(@Param('id') id: string) {
    return this.supportTicketsService.getMessages(id);
  }
}
