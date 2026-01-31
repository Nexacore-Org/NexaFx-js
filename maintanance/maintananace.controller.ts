import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MaintenanceService } from './maintenance.service';
import { UpdateMaintenanceDto, EnableMaintenanceDto } from './dto/update-maintenance.dto';

// Import your actual auth guard
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { RolesGuard } from '../auth/guards/roles.guard';
// import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Maintenance')
@Controller('maintenance')
// @ApiBearerAuth()
// @UseGuards(JwtAuthGuard, RolesGuard)
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get current maintenance status' })
  @ApiResponse({
    status: 200,
    description: 'Returns current maintenance configuration',
  })
  async getStatus() {
    const config = await this.maintenanceService.getMaintenanceConfig();
    return {
      isMaintenanceMode: config.isMaintenanceMode,
      message: config.message,
      estimatedEndTime: config.estimatedEndTime,
      disabledEndpoints: config.disabledEndpoints,
    };
  }

  @Post('enable')
  // @Roles('admin', 'superadmin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable maintenance mode' })
  @ApiResponse({
    status: 200,
    description: 'Maintenance mode enabled successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async enableMaintenance(@Body() enableDto: EnableMaintenanceDto) {
    const config = await this.maintenanceService.enableMaintenance(enableDto);
    return {
      message: 'Maintenance mode enabled',
      config: {
        isMaintenanceMode: config.isMaintenanceMode,
        message: config.message,
        estimatedEndTime: config.estimatedEndTime,
        disabledEndpoints: config.disabledEndpoints,
      },
    };
  }

  @Post('disable')
  // @Roles('admin', 'superadmin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable maintenance mode' })
  @ApiResponse({
    status: 200,
    description: 'Maintenance mode disabled successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async disableMaintenance() {
    await this.maintenanceService.disableMaintenance();
    return {
      message: 'Maintenance mode disabled',
    };
  }

  @Put('config')
  // @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'Update maintenance configuration' })
  @ApiResponse({
    status: 200,
    description: 'Configuration updated successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async updateConfig(@Body() updateDto: UpdateMaintenanceDto) {
    const config = await this.maintenanceService.updateConfig(updateDto);
    return {
      message: 'Configuration updated',
      config: {
        isMaintenanceMode: config.isMaintenanceMode,
        message: config.message,
        estimatedEndTime: config.estimatedEndTime,
        disabledEndpoints: config.disabledEndpoints,
        bypassRoles: config.bypassRoles,
      },
    };
  }
}