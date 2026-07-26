import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ScheduledReportsService,
  CreateScheduledReportDto,
} from './scheduled-reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@Controller('api/v1/scheduled-reports')
@UseGuards(JwtAuthGuard)
export class ScheduledReportsController {
  constructor(private readonly reportsService: ScheduledReportsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: Omit<CreateScheduledReportDto, 'userId'>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reportsService.create({
      ...dto,
      userId: request.user?.sub ?? '',
    });
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.reportsService.findByUserId(request.user?.sub ?? '');
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.reportsService.deactivate(id);
  }
}
