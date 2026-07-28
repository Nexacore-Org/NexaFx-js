import { CacheInterceptor, CacheTTL, CacheKey } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { join, resolve, normalize } from 'path';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';
import { UpdateTransactionStatusDto } from './dto/update-transaction-status.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { AdminTransactionsQueryDto } from './dto/admin-transactions-query.dto';
import { TransactionStatus } from '../transactions/transaction.entity';

const adminStatsTtlSeconds = parseInt(
  process.env.CACHE_ADMIN_STATS_TTL_SECONDS || '60',
  10,
);

const KYC_UPLOAD_BASE = resolve(process.cwd(), 'uploads', 'kyc');

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
    isEmailVerified: boolean;
  };
}

function assertSafePathSegment(segment: string, paramName: string): void {
  if (/[/\\]/.test(segment) || segment.includes('..')) {
    throw new BadRequestException(
      `Invalid path segment in ${paramName} � traversal sequences are not permitted`,
    );
  }
}

@Controller('api/v1/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @UseInterceptors(CacheInterceptor)
  @CacheKey('admin-stats')
  @CacheTTL(adminStatsTtlSeconds)
  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Get('reports/cbn-compliance')
  generateCbnComplianceReport(@Query('period') period?: string) {
    return this.adminService.generateCbnComplianceReport(period);
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Get('search')
  searchPlatform(@Query('q') query: string) {
    return this.adminService.searchPlatform(query ?? '');
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Get('transactions')
  findAllTransactions(@Query() query: AdminTransactionsQueryDto) {
    return this.adminService.findAllTransactions({
      userId: query.userId,
      status: query.status as TransactionStatus | undefined,
      currency: query.currency,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page,
      limit: query.limit,
    });
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Patch('transactions/:id/status')
  overrideTransactionStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.adminService.overrideTransactionStatus(
      id,
      dto.status,
      req.user.id,
      dto.reason,
    );
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Patch('users/:id/status')
  updateUserStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.adminService.updateUserStatus(
      id,
      dto.isActive,
      req.user.id,
      dto.reason,
    );
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Patch('users/:id/role')
  updateUserRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.adminService.updateUserRole(
      id,
      dto.role,
      req.user.id,
      dto.reason,
    );
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Post('users/:id/impersonate')
  impersonateUser(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.adminService.impersonateUser(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Get('reports/cbn-compliance')
  generateCbnComplianceReport(@Query('period') period?: string) {
    return this.adminService.generateCbnComplianceReport(period);
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Get('kyc/:userId/:version/:filename')
  serveKycFile(
    @Param('userId') userId: string,
    @Param('version') version: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    assertSafePathSegment(userId, 'userId');
    assertSafePathSegment(version, 'version');
    assertSafePathSegment(filename, 'filename');

    const filePath = join(KYC_UPLOAD_BASE, userId, version, filename);
    const normalizedPath = normalize(filePath);

    if (!normalizedPath.startsWith(KYC_UPLOAD_BASE + '/')) {
      throw new BadRequestException(
        'Resolved path falls outside the KYC uploads directory',
      );
    }

    res.sendFile(normalizedPath, (err) => {
      if (err) {
        res.status(404).json({ message: 'KYC file not found' });
      }
    });
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Get('spreads')
  getSpreads() {
    return this.adminService.getSpreads();
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Patch('spreads')
  updateSpread(
    @Body('pair') pair: string,
    @Body('spreadPercentage') spreadPercentage: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.adminService.updateSpread(pair, spreadPercentage, req.user.id);
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Post('users/:id/impersonate')
  impersonateUser(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.adminService.impersonateUser(id, req.user.id);
  }
}
