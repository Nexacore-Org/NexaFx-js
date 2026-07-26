import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
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
import { JwtAuthGuard } from '../modules/auth/guards/jwt.guard';
import { DisputesService } from './disputes.service';
import { FileDisputeDto, DisputeMessageDto, EscalateDisputeDto } from './dto/dispute.dto';

@ApiTags('Disputes')
@ApiBearerAuth('access-token')
@Controller('api/v1/disputes')
@UseGuards(JwtAuthGuard)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'File a new dispute' })
  @ApiCreatedResponse({ description: 'Dispute filed successfully' })
  async fileDispute(@Request() req: any, @Body() dto: FileDisputeDto) {
    const userId = req.user?.id;
    return this.disputesService.fileDispute(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List disputes for the authenticated user' })
  @ApiOkResponse({ description: 'Paginated list of disputes' })
  async findAll(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user?.id;
    return this.disputesService.findAllByUser(userId, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific dispute with messages' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiOkResponse({ description: 'Dispute details with messages' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id;
    return this.disputesService.findOne(id, userId);
  }

  @Post(':id/escalate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Escalate a dispute' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiOkResponse({ description: 'Dispute escalated' })
  async escalate(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: EscalateDisputeDto,
  ) {
    const userId = req.user?.id;
    return this.disputesService.escalate(id, userId, dto);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a message to a dispute' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiCreatedResponse({ description: 'Message added' })
  async addMessage(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: DisputeMessageDto,
  ) {
    const userId = req.user?.id;
    return this.disputesService.addMessage(id, userId, 'user', dto);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a dispute' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiOkResponse({ description: 'Dispute resolved' })
  async resolve(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id;
    return this.disputesService.resolve(id, userId);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a dispute' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiOkResponse({ description: 'Dispute rejected' })
  async reject(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id;
    return this.disputesService.reject(id, userId);
  }
}
