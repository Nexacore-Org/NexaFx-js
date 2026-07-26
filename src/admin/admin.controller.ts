import { CacheInterceptor, CacheTTL, CacheKey } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
      `Invalid path segment in ${paramName} — traversal sequences are not permitted`,
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
}
