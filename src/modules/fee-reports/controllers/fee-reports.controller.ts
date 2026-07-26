import {
  Body,
  Controller,
  Get,
  Post,
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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { FeeReportsService } from '../services/fee-reports.service';
import { GenerateFeeReportDto } from '../dto/generate-fee-report.dto';
import { ListFeeReportsDto } from '../dto/list-fee-reports.dto';

@ApiTags('Fee Reports')
@ApiBearerAuth('access-token')
@Controller('fee-reports')
@UseGuards(JwtAuthGuard)
export class FeeReportsController {
  constructor(private readonly feeReportsService: FeeReportsService) {}

  @Get()
  @ApiOperation({ summary: 'List fee reports' })
  @ApiOkResponse({ description: 'Paginated list of fee reports' })
  async findAll(@Request() req: any, @Query(ValidationPipe) dto: ListFeeReportsDto) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.feeReportsService.findAll(userId, dto);
  }

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a fee report' })
  @ApiCreatedResponse({ description: 'Fee report generated' })
  async generate(@Request() req: any, @Body(ValidationPipe) dto: GenerateFeeReportDto) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.feeReportsService.generate(userId, dto);
  }
}
