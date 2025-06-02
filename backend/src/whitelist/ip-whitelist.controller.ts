import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    HttpCode,
    HttpStatus,
    UseGuards,
    Query,
    Req,
    Logger,
  } from '@nestjs/common';
  import { Request } from 'express';
  import { IpWhitelistService } from './ip-whitelist.service';
  import { IpWhitelistGuard, SkipIpWhitelist } from './ip-whitelist.guard';
  import {
    CreateIpWhitelistDto,
    UpdateIpWhitelistDto,
    IpWhitelistResponseDto,
  } from './ip-whitelist.dto';
  
  @Controller('ip-whitelist')
  @UseGuards(IpWhitelistGuard)
  export class IpWhitelistController {
    private readonly logger = new Logger(IpWhitelistController.name);
  
    constructor(private readonly ipWhitelistService: IpWhitelistService) {}
  
    @Get()
    async findAll(): Promise<{
      data: IpWhitelistResponseDto[];
      total: number;
      message: string;
    }> {
      const data = await this.ipWhitelistService.findAll();
      return {
        data,
        total: data.length,
        message: 'IP whitelist retrieved successfully',
      };
    }
  
    @Get('active')
    async getActiveIps(): Promise<{
      data: string[];
      total: number;
      message: string;
    }> {
      const data = await this.ipWhitelistService.getActiveIps();
      return {
        data,
        total: data.length,
        message: 'Active whitelisted IPs retrieved successfully',
      };
    }
  
    @Get('check')
    @SkipIpWhitelist()
    async checkCurrentIp(@Req() request: Request): Promise<{
      clientIp: string;
      isWhitelisted: boolean;
      message: string;
    }> {
      const clientIp = request.ip || 'unknown';
      const isWhitelisted = await this.ipWhitelistService.isIpWhitelisted(clientIp);
      
      return {
        clientIp,
        isWhitelisted,
        message: `Your IP ${clientIp} is ${isWhitelisted ? 'whitelisted' : 'not whitelisted'}`,
      };
    }
  
    @Get(':id')
    async findById(@Param('id') id: string): Promise<{
      data: IpWhitelistResponseDto;
      message: string;
    }> {
      const data = await this.ipWhitelistService.findById(id);
      return {
        data,
        message: 'IP whitelist entry retrieved successfully',
      };
    }
  
    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(
      @Body() createDto: CreateIpWhitelistDto,
      @Req() request: Request,
    ): Promise<{
      data: IpWhitelistResponseDto;
      message: string;
    }> {
      // Auto-set createdBy if not provided
      if (!createDto.createdBy) {
        createDto.createdBy = request.ip || 'unknown';
      }
  
      const data = await this.ipWhitelistService.create(createDto);
      this.logger.log(`IP ${createDto.ipAddress} added to whitelist by ${createDto.createdBy}`);
      
      return {
        data,
        message: 'IP address added to whitelist successfully',
      };
    }
  
    @Post('bulk')
    @HttpCode(HttpStatus.CREATED)
    async bulkCreate(
      @Body() bulkDto: { ipAddresses: string[] },
      @Req() request: Request,
    ): Promise<{
      data: IpWhitelistResponseDto[];
      successful: number;
      failed: number;
      message: string;
    }> {
      const createdBy = request.ip || 'unknown';
      const data = await this.ipWhitelistService.bulkCreate(bulkDto.ipAddresses, createdBy);
      
      return {
        data,
        successful: data.length,
        failed: bulkDto.ipAddresses.length - data.length,
        message: `Bulk import completed. ${data.length} IPs added successfully.`,
      };
    }
  
    @Put(':id')
    async update(
      @Param('id') id: string,
      @Body() updateDto: UpdateIpWhitelistDto,
    ): Promise<{
      data: IpWhitelistResponseDto;
      message: string;
    }> {
      const data = await this.ipWhitelistService.update(id, updateDto);
      this.logger.log(`IP whitelist entry ${id} updated`);
      
      return {
        data,
        message: 'IP whitelist entry updated successfully',
      };
    }
  
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async delete(@Param('id') id: string): Promise<void> {
      await this.ipWhitelistService.delete(id);
      this.logger.log(`IP whitelist entry ${id} deleted`);
    }
  
    @Post(':id/toggle')
    async toggleStatus(@Param('id') id: string): Promise<{
      data: IpWhitelistResponseDto;
      message: string;
    }> {
      const currentEntry = await this.ipWhitelistService.findById(id);
      const data = await this.ipWhitelistService.update(id, {
        isActive: !currentEntry.isActive,
      });
      
      return {
        data,
        message: `IP whitelist entry ${data.isActive ? 'activated' : 'deactivated'} successfully`,
      };
    }
  }
  