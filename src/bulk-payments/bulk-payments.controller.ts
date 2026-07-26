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
import { BulkPaymentsService } from './bulk-payments.service';
import { CreateBulkPaymentDto } from './dto/create-bulk-payment.dto';

@ApiTags('Bulk Payments')
@ApiBearerAuth('access-token')
@Controller('api/v1/bulk-payments')
@UseGuards(JwtAuthGuard)
export class BulkPaymentsController {
  constructor(private readonly bulkPaymentsService: BulkPaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a bulk payment' })
  @ApiCreatedResponse({ description: 'Bulk payment created and processing started' })
  async create(@Request() req: any, @Body() dto: CreateBulkPaymentDto) {
    const userId = req.user?.id;
    return this.bulkPaymentsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List bulk payments for the authenticated user' })
  @ApiOkResponse({ description: 'Paginated list of bulk payments' })
  async findAll(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user?.id;
    return this.bulkPaymentsService.findAllByUser(userId, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific bulk payment with items' })
  @ApiParam({ name: 'id', description: 'Bulk payment UUID' })
  @ApiOkResponse({ description: 'Bulk payment details with items' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id;
    return this.bulkPaymentsService.findOne(id, userId);
  }
}
