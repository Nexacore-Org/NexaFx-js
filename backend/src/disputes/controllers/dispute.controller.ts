import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFiles,
  ParseUUIDPipe,
  ParseIntPipe,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import * as path from 'path';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
} from '@nestjs/swagger';
import { DisputeService } from '../services/dispute.service';
import { CreateDisputeDto } from '../dto/create-dispute.dto';
import { UpdateDisputeDto } from '../dto/update-dispute.dto';
import { AddCommentDto } from '../dto/add-comment.dto';
import { ResolveDisputeDto } from '../dto/resolve-dispute.dto';
import { AssignDisputeDto } from '../dto/assign-dispute.dto';
import { EscalateDisputeDto } from '../dto/escalate-dispute.dto';
import { ProcessRefundDto, RefundResponseDto } from '../dto/process-refund.dto';
import { Dispute } from '../entities/dispute.entity';
import { DisputeCategory } from '../entities/dispute.entity';

import { JwtAuthGuard } from '../../oauth/guards/jwt-auth.guard';
import { AgentGuard } from '../guards/agent.guard';
import { AdminGuard } from '../guards/admin.guard';
import { DisputeAccessGuard } from '../guards/dispute-access.guard';
import { SetMetadata } from '@nestjs/common';
import { CurrentUser } from '../../rbac-system/decorators/current-user.decorator';

// Multer helpers: sanitize filenames and allowlist validation
const ALLOWED_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);
const ALLOWED_EXTENSIONS = new Set<string>(['.jpg', '.jpeg', '.png', '.pdf']);

function sanitizeFilename(originalname: string): string {
  const ext = path.extname(originalname || '').toLowerCase();
  const base = path.basename(originalname || 'file', ext);
  const sanitizedBase =
    (base || 'file')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 100) || 'file';
  return `${sanitizedBase}${ext}`;
}

function isAllowedFile(mime: string, ext: string): boolean {
  return ALLOWED_MIME_TYPES.has(mime) && ALLOWED_EXTENSIONS.has(ext);
}

@ApiTags('Disputes')
@Controller('disputes')
@UseGuards(JwtAuthGuard)
export class DisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  @Post('create')
  @ApiOperation({ summary: 'Create new dispute for a transaction' })
  @ApiResponse({ status: 201, description: 'Dispute created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async createDispute(
    @Body() createDisputeDto: CreateDisputeDto,
    @CurrentUser() user: { id: string },
  ): Promise<{ disputeId: string }> {
    const dispute = await this.disputeService.createDispute(
      createDisputeDto,
      user.id,
    );
    return { disputeId: dispute.id };
  }

  @Post('create-with-files')
  @ApiOperation({ summary: 'Create dispute with evidence files' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('evidenceFiles', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 10 },
      fileFilter: (
        req: any,
        file: Express.Multer.File,
        cb: (error: any, acceptFile: boolean) => void,
      ) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const mime = (file.mimetype || '').toLowerCase();
        const sanitized = sanitizeFilename(file.originalname || 'file');
        // assign sanitized name for downstream consumers
        (file as unknown as { originalname: string }).originalname = sanitized;

        if (!isAllowedFile(mime, ext)) {
          return cb(new BadRequestException('Invalid file type'), false);
        }
        cb(null, true);
      },
    }),
  )
  @ApiResponse({ status: 201, description: 'Dispute created successfully' })
  async createDisputeWithFiles(
    @Body() createDisputeDto: CreateDisputeDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: { id: string },
  ): Promise<{ disputeId: string }> {
    // Use transactional method to ensure atomicity
    const dispute = await this.disputeService.createDisputeWithEvidence(
      createDisputeDto,
      files || [],
      user.id,
    );

    return { disputeId: dispute.id };
  }

  @Get(':disputeId')
  @ApiOperation({ summary: 'Get dispute details' })
  @ApiResponse({ status: 200, description: 'Dispute details', type: Dispute })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  @UseGuards(DisputeAccessGuard)
  async getDispute(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
  ): Promise<Dispute> {
    return this.disputeService.findOne(disputeId);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get user dispute history' })
  @ApiResponse({ status: 200, description: 'User disputes', type: [Dispute] })
  async getUserDisputes(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser()
    currentUser: { id: string; isAdmin?: boolean; isAgent?: boolean },
    @Query('state') state?: string,
    @Query('category') category?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ): Promise<Dispute[]> {
    // Verify the user can only access their own disputes (unless admin/agent)
    if (
      currentUser.id !== userId &&
      !currentUser.isAdmin &&
      !currentUser.isAgent
    ) {
      throw new ForbiddenException('You can only access your own disputes');
    }
    const filters = { state, category, limit, offset };
    return this.disputeService.findByUser(userId, filters);
  }

  @Patch(':disputeId/update')
  @ApiOperation({ summary: 'Update dispute information' })
  @ApiResponse({ status: 200, description: 'Dispute updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @UseGuards(DisputeAccessGuard)
  async updateDispute(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Body() updateDisputeDto: UpdateDisputeDto,
    @CurrentUser() user: { id: string },
  ): Promise<Dispute> {
    return this.disputeService.updateDispute(
      disputeId,
      updateDisputeDto,
      user.id,
    );
  }

  @Post(':disputeId/evidence')
  @ApiOperation({ summary: 'Submit evidence for dispute' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 10 },
      fileFilter: (
        req: any,
        file: Express.Multer.File,
        cb: (error: any, acceptFile: boolean) => void,
      ) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const mime = (file.mimetype || '').toLowerCase();
        const sanitized = sanitizeFilename(file.originalname || 'file');
        (file as unknown as { originalname: string }).originalname = sanitized;

        if (!isAllowedFile(mime, ext)) {
          return cb(new BadRequestException('Invalid file type'), false);
        }
        cb(null, true);
      },
    }),
  )
  @ApiResponse({ status: 201, description: 'Evidence uploaded successfully' })
  @UseGuards(DisputeAccessGuard)
  async uploadEvidence(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: { id: string },
  ): Promise<any> {
    return this.disputeService.uploadEvidence(disputeId, files, user.id);
  }

  @Get(':disputeId/evidence')
  @ApiOperation({ summary: 'Get dispute evidence' })
  @ApiResponse({ status: 200, description: 'Evidence list' })
  @UseGuards(JwtAuthGuard, DisputeAccessGuard)
  @SetMetadata('dispute_access_mode', 'evidence')
  async getEvidence(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
  ): Promise<any> {
    const dispute = await this.disputeService.findOne(disputeId);
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }
    return dispute?.evidences ?? [];
  }

  @Post(':disputeId/comment')
  @ApiOperation({ summary: 'Add comment to dispute' })
  @ApiResponse({ status: 201, description: 'Comment added successfully' })
  @UseGuards(DisputeAccessGuard)
  async addComment(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Body() addCommentDto: AddCommentDto,
    @CurrentUser() user: { id: string; type?: string },
  ): Promise<any> {
    return this.disputeService.addComment(
      disputeId,
      addCommentDto,
      user.id,
      user.type || 'user',
    );
  }

  @Get(':disputeId/timeline')
  @ApiOperation({ summary: 'Get dispute activity timeline' })
  @ApiResponse({ status: 200, description: 'Timeline entries' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - User not authorized to access this dispute timeline',
  })
  @UseGuards(DisputeAccessGuard)
  async getTimeline(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
  ): Promise<any> {
    const dispute = await this.disputeService.findOne(disputeId);
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }
    return dispute?.timeline ?? [];
  }

  @Post('admin/:disputeId/assign')
  @ApiOperation({ summary: 'Assign dispute to support agent' })
  @UseGuards(AgentGuard)
  @ApiResponse({ status: 200, description: 'Dispute assigned successfully' })
  async assignDispute(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Body() assignDto: AssignDisputeDto,
    @CurrentUser() user: { id: string },
  ): Promise<Dispute> {
    return this.disputeService.assignDispute(disputeId, assignDto, user.id);
  }

  @Post('admin/:disputeId/resolve')
  @ApiOperation({ summary: 'Resolve dispute' })
  @UseGuards(AgentGuard)
  @ApiResponse({ status: 200, description: 'Dispute resolved successfully' })
  async resolveDispute(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Body() resolveDto: ResolveDisputeDto,
    @CurrentUser() user: { id: string },
  ): Promise<Dispute> {
    return this.disputeService.resolveDispute(disputeId, resolveDto, user.id);
  }

  @Post('admin/:disputeId/escalate')
  @ApiOperation({ summary: 'Escalate dispute to higher tier' })
  @UseGuards(AgentGuard)
  @ApiResponse({ status: 200, description: 'Dispute escalated successfully' })
  async escalateDispute(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Body() escalateDto: EscalateDisputeDto,
    @CurrentUser() user: { id: string },
  ): Promise<Dispute> {
    return this.disputeService.escalateDispute(disputeId, escalateDto, user.id);
  }

  @Get('admin/pending')
  @ApiOperation({ summary: 'Get pending disputes' })
  @UseGuards(AgentGuard)
  @ApiResponse({
    status: 200,
    description: 'Pending disputes',
    type: [Dispute],
  })
  async getPendingDisputes(
    @Query('priority') priority?: string,
    @Query('category') category?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ): Promise<Dispute[]> {
    const filters = { priority, category, limit, offset };
    return this.disputeService.getPendingDisputes(filters);
  }

  @Get('admin/assigned/:agentId')
  @ApiOperation({ summary: 'Get disputes assigned to agent' })
  @UseGuards(AgentGuard)
  @ApiResponse({
    status: 200,
    description: 'Assigned disputes',
    type: [Dispute],
  })
  async getAssignedDisputes(
    @Param('agentId', ParseUUIDPipe) agentId: string,
  ): Promise<Dispute[]> {
    return this.disputeService.getAssignedDisputes(agentId);
  }

  @Post(':disputeId/cancel')
  @ApiOperation({ summary: 'Cancel dispute (user)' })
  @ApiResponse({ status: 200, description: 'Dispute cancelled successfully' })
  @UseGuards(DisputeAccessGuard)
  async cancelDispute(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @CurrentUser() user: { id: string },
  ): Promise<Dispute> {
    return this.disputeService.cancelDispute(disputeId, user.id);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get available dispute categories' })
  @ApiResponse({ status: 200, description: 'Available categories' })
  getCategories(): { categories: DisputeCategory[] } {
    return { categories: Object.values(DisputeCategory) };
  }

  @Post(':disputeId/refund')
  @ApiOperation({
    summary: 'Process refund for resolved dispute',
    description:
      'Initiates refund processing for a resolved dispute. Only disputes in RESOLVED state with a valid refund amount can be refunded.',
  })
  @UseGuards(AdminGuard)
  @ApiResponse({
    status: 202,
    description: 'Refund processing initiated successfully',
    type: RefundResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad request - dispute not in valid state for refund or invalid refund amount',
  })
  @ApiResponse({
    status: 404,
    description: 'Dispute not found',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error during refund processing',
  })
  async processRefund(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Body() processRefundDto: ProcessRefundDto,
    @CurrentUser() user: { id: string },
  ): Promise<RefundResponseDto> {
    if (!processRefundDto) {
      throw new BadRequestException('Refund request body is required');
    }
    return this.disputeService.processRefund(
      disputeId,
      user.id,
      processRefundDto.amount,
      processRefundDto.reason,
    );
  }

  @Get('admin/statistics')
  @ApiOperation({ summary: 'Get dispute metrics and statistics' })
  @UseGuards(AdminGuard)
  @ApiResponse({ status: 200, description: 'Dispute statistics' })
  async getStatistics(): Promise<any> {
    return this.disputeService.getStatistics();
  }

  @Post(':disputeId/auto-resolve')
  @ApiOperation({ summary: 'Trigger automated resolution check' })
  @ApiResponse({ status: 200, description: 'Auto-resolution triggered' })
  @UseGuards(AgentGuard)
  async triggerAutoResolve(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
  ): Promise<Dispute> {
    return this.disputeService.triggerAutoResolve(disputeId);
  }

  @Get('admin/sla-violations')
  @ApiOperation({ summary: 'Get disputes violating SLA' })
  @UseGuards(AdminGuard)
  @ApiResponse({ status: 200, description: 'SLA violations', type: [Dispute] })
  async getSlaViolations(): Promise<Dispute[]> {
    return this.disputeService.getSlaViolations();
  }
}
