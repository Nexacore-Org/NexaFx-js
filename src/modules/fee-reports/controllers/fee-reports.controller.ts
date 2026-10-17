import {
  Body,
  Controller,
  Get,
  Post,
  Query,
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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
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
  async findAll(@CurrentUser('sub') userId: string, @Query(ValidationPipe) dto: ListFeeReportsDto) {
    return this.feeReportsService.findAll(userId, dto);
  }

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a fee report' })
  @ApiCreatedResponse({ description: 'Fee report generated' })
  async generate(@CurrentUser('sub') userId: string, @Body(ValidationPipe) dto: GenerateFeeReportDto) {
    return this.feeReportsService.generate(userId, dto);
  }
}
