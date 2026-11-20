import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateScheduledReportDto } from './dto/create-scheduled-report.dto';
import { ListScheduledReportRunsDto } from './dto/list-scheduled-report-runs.dto';
import { ListScheduledReportsDto } from './dto/list-scheduled-reports.dto';
import { UpdateScheduledReportDto } from './dto/update-scheduled-report.dto';
import { ScheduledReportsService } from './scheduled-reports.service';

@Controller('scheduled-reports')
@UseGuards(JwtAuthGuard)
export class ScheduledReportsController {
  constructor(private readonly reportsService: ScheduledReportsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateScheduledReportDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reportsService.create(userId, dto);
  }

  @Get()
  findAll(
    @Query() query: ListScheduledReportsDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reportsService.findByUserId(
      userId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get(':id/runs')
  findRuns(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListScheduledReportRunsDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reportsService.findRunsByReportId(
      id,
      userId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduledReportDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reportsService.update(id, userId, dto);
  }

  @Patch(':id/deactivate')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reportsService.deactivate(id, userId);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reportsService.activate(id, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reportsService.remove(id, userId);
  }
}
