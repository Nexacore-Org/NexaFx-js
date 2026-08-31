import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiParam,
} from '@nestjs/swagger';
import { DisputesService } from './disputes.service';
import { DisputeStatus } from './dispute.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import {
  FileDisputeDto,
  DisputeMessageDto,
  EscalateDisputeDto,
} from './dto/dispute.dto';

class ResolveDisputeBody {
  @IsEnum([DisputeStatus.RESOLVED, DisputeStatus.REJECTED])
  status!: DisputeStatus.RESOLVED | DisputeStatus.REJECTED;

  @IsString()
  @IsNotEmpty()
  resolution!: string;
}

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@ApiTags('Disputes')
@ApiBearerAuth('access-token')
@Controller('api/v1')
@UseGuards(JwtAuthGuard)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post('disputes')
  @ApiOperation({ summary: 'File a new dispute' })
  @ApiCreatedResponse({ description: 'Dispute filed successfully' })
  async fileDispute(
    @Req() req: AuthenticatedRequest,
    @Body() dto: FileDisputeDto,
  ) {
    const userId = req.user.id;
    return this.disputesService.fileDispute(userId, dto);
  }

  @Get('disputes')
  @ApiOperation({ summary: 'List disputes for the authenticated user' })
  @ApiOkResponse({ description: 'Paginated list of disputes' })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user.id;
    return this.disputesService.findAllByUser(userId, page, limit);
  }

  @Get('disputes/:id')
  @ApiOperation({ summary: 'Get a specific dispute with messages' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiOkResponse({ description: 'Dispute details with messages' })
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    return this.disputesService.findOne(id, userId);
  }

  @Post('disputes/:id/escalate')
  @ApiOperation({ summary: 'Escalate a dispute' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiOkResponse({ description: 'Dispute escalated' })
  async escalate(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: EscalateDisputeDto,
  ) {
    const userId = req.user.id;
    return this.disputesService.escalate(id, userId, dto);
  }

  @Post('disputes/:id/messages')
  @ApiOperation({ summary: 'Add a message to a dispute' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiCreatedResponse({ description: 'Message added' })
  async addMessage(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: DisputeMessageDto,
  ) {
    const userId = req.user.id;
    return this.disputesService.addMessage(id, userId, 'user', dto);
  }

  @Post('disputes/:id/resolve')
  @ApiOperation({ summary: 'Resolve a dispute' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiOkResponse({ description: 'Dispute resolved' })
  async resolve(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    return this.disputesService.resolve(id, userId);
  }

  @Post('disputes/:id/reject')
  @ApiOperation({ summary: 'Reject a dispute' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiOkResponse({ description: 'Dispute rejected' })
  async reject(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    return this.disputesService.reject(id, userId);
  }

  @UseGuards(AdminRoleGuard)
  @Patch('admin/disputes/:id')
  @ApiOperation({ summary: 'Admin: resolve or reject a dispute' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiOkResponse({ description: 'Dispute updated' })
  async resolveDispute(
    @Param('id') id: string,
    @Body() body: ResolveDisputeBody,
  ) {
    return this.disputesService.resolveDispute(id, body);
  }
}
