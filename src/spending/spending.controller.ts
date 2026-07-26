import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { SpendingService } from './spending.service';
import { CreateSpendingCategoryDto } from './dto/create-spending-category.dto';
import { CreateSpendingEntryDto } from './dto/create-spending-entry.dto';
import { QuerySpendingSummaryDto } from './dto/query-spending-summary.dto';
import { JwtAuthGuard } from '../modules/auth/guards/jwt.guard';

@ApiTags('Spending')
@ApiBearerAuth('access-token')
@Controller('spending')
@UseGuards(JwtAuthGuard)
export class SpendingController {
  constructor(private readonly spendingService: SpendingService) {}

  private getUserId(req: any): string {
    return req.user?.id || req.user?.sub;
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get spending summary by period' })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'year'] })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getSummary(@Request() req: any, @Query() query: QuerySpendingSummaryDto) {
    return this.spendingService.getSummary(this.getUserId(req), query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List spending categories' })
  async getCategories(@Request() req: any) {
    return this.spendingService.getCategories(this.getUserId(req));
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a spending category' })
  async createCategory(@Request() req: any, @Body() dto: CreateSpendingCategoryDto) {
    return this.spendingService.createCategory(this.getUserId(req), dto);
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete a spending category' })
  async deleteCategory(@Request() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.spendingService.deleteCategory(this.getUserId(req), id);
    return { message: 'Category deleted successfully.' };
  }

  @Post('entries')
  @ApiOperation({ summary: 'Create a spending entry' })
  async createEntry(@Request() req: any, @Body() dto: CreateSpendingEntryDto) {
    return this.spendingService.createEntry(this.getUserId(req), dto);
  }

  @Get('entries')
  @ApiOperation({ summary: 'List spending entries' })
  async getEntries(@Request() req: any, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.spendingService.getEntries(
      this.getUserId(req),
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}
