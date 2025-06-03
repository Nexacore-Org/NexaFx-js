import { 
    Controller, 
    Get, 
    Post, 
    Delete, 
    Query, 
    Req, 
    UseInterceptors,
    Logger 
  } from '@nestjs/common';
  import { Request } from 'express';
  import { GeoipService, LocationRecord, GeoipInfo } from './geoip.service';
  
  @Controller('geoip')
  export class GeoipController {
    private readonly logger = new Logger(GeoipController.name);
  
    constructor(private readonly geoipService: GeoipService) {}
  
    @Post('log')
    async logCurrentRequest(@Req() request: Request): Promise<LocationRecord> {
      this.logger.log('Manual geolocation logging requested');
      return await this.geoipService.processRequest(request);
    }
  
    @Get('lookup/:ip')
    async lookupIP(@Query('ip') ip: string, @Query('token') token?: string): Promise<GeoipInfo> {
      if (!ip) {
        throw new Error('IP address is required');
      }
      
      this.logger.log(`GeoIP lookup requested for IP: ${ip}`);
      return await this.geoipService.getGeoipInfo(ip, token);
    }
  
    @Get('records')
    getLocationRecords(): LocationRecord[] {
      this.logger.log('Location records requested');
      return this.geoipService.getLocationRecords();
    }
  
    @Get('records/by-ip')
    getRecordsByIP(@Query('ip') ip: string): LocationRecord[] {
      if (!ip) {
        throw new Error('IP address is required');
      }
      
      this.logger.log(`Location records requested for IP: ${ip}`);
      return this.geoipService.getLocationRecordsByIP(ip);
    }
  
    @Get('records/by-country')
    getRecordsByCountry(@Query('country') country: string): LocationRecord[] {
      if (!country) {
        throw new Error('Country is required');
      }
      
      this.logger.log(`Location records requested for country: ${country}`);
      return this.geoipService.getLocationRecordsByCountry(country);
    }
  
    @Get('stats')
    getLocationStats() {
      const records = this.geoipService.getLocationRecords();
      
      const stats = {
        totalRequests: records.length,
        uniqueIPs: new Set(records.map(r => r.ip)).size,
        countries: [...new Set(records.map(r => r.geoipInfo.country))].filter(Boolean),
        cities: [...new Set(records.map(r => r.geoipInfo.city))].filter(Boolean),
        recentRequests: records.slice(-10).reverse(),
      };
  
      this.logger.log(`Location stats requested - Total: ${stats.totalRequests}, Unique IPs: ${stats.uniqueIPs}`);
      return stats;
    }
  
    @Delete('records')
    clearLocationRecords(): { message: string } {
      this.logger.log('Location records cleared');
      this.geoipService.clearLocationRecords();
      return { message: 'Location records cleared successfully' };
    }
  }