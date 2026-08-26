import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  AmlScreeningService,
  ScreenUserInput,
  ScreenTransactionInput,
  ScreeningFilters,
} from './aml-screening.service';
import { AmlRiskLevel } from './aml-screening.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@Controller('api/v1')
export class AmlController {
  constructor(private readonly screeningService: AmlScreeningService) {}

  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @Post('aml/screen/user')
  @HttpCode(HttpStatus.CREATED)
  screenUser(@Body() input: ScreenUserInput) {
    return this.screeningService.screenUser(input);
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @Post('aml/screen/transaction')
  @HttpCode(HttpStatus.CREATED)
  screenTransaction(@Body() input: ScreenTransactionInput) {
    return this.screeningService.screenTransaction(input);
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @Get('admin/aml')
  findAll(
    @Query('userId') userId?: string,
    @Query('riskLevel') riskLevel?: AmlRiskLevel,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: ScreeningFilters = {
      userId,
      riskLevel,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    };
    return this.screeningService.findAll(filters);
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @Get('admin/aml/:id')
  findById(@Param('id') id: string) {
    return this.screeningService.findById(id);
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @Patch('admin/aml/:id/review')
  @HttpCode(HttpStatus.OK)
  review(
    @Param('id') id: string,
    @Body() body: { notes: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const reviewedBy = req.user?.sub ?? '';
    return this.screeningService.review(id, reviewedBy, body.notes);
  }
}
