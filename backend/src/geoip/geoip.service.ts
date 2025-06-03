import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface GeoipInfo {
  ip: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string; // latitude,longitude
  org?: string;
  postal?: string;
  timezone?: string;
}

export interface LocationRecord {
  ip: string;
  timestamp: Date;
  userAgent?: string;
  geoipInfo: GeoipInfo;
}

@Injectable()
export class GeoipService {
  private readonly logger = new Logger(GeoipService.name);
  private readonly locationRecords: LocationRecord[] = [];

  constructor(private readonly httpService: HttpService) {}

  async getGeoipInfo(ip: string, token?: string): Promise<GeoipInfo> {
    try {
      // Handle localhost/private IPs
      if (this.isPrivateIP(ip)) {
        this.logger.warn(`Private IP detected: ${ip}, using fallback data`);
        return {
          ip,
          city: 'Unknown',
          region: 'Unknown',
          country: 'Unknown',
          loc: '0,0',
          org: 'Private Network',
        };
      }

      const url = token 
        ? `https://ipinfo.io/${ip}?token=${token}`
        : `https://ipinfo.io/${ip}`;

      const response = await firstValueFrom(
        this.httpService.get<GeoipInfo>(url)
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch GeoIP data for ${ip}:`, error.message);
      return {
        ip,
        city: 'Unknown',
        region: 'Unknown',
        country: 'Unknown',
        loc: '0,0',
        org: 'Unknown',
      };
    }
  }

  async logUserLocation(
    ip: string, 
    userAgent?: string, 
    token?: string
  ): Promise<LocationRecord> {
    const geoipInfo = await this.getGeoipInfo(ip, token);
    
    const record: LocationRecord = {
      ip,
      timestamp: new Date(),
      userAgent,
      geoipInfo,
    };

    this.locationRecords.push(record);
    
    this.logger.log(
      `Location logged - IP: ${ip}, Country: ${geoipInfo.country}, ` +
      `City: ${geoipInfo.city}, Timestamp: ${record.timestamp.toISOString()}`
    );

    return record;
  }

  getLocationRecords(): LocationRecord[] {
    return [...this.locationRecords];
  }

  getLocationRecordsByIP(ip: string): LocationRecord[] {
    return this.locationRecords.filter(record => record.ip === ip);
  }

  getLocationRecordsByCountry(country: string): LocationRecord[] {
    return this.locationRecords.filter(
      record => record.geoipInfo.country?.toLowerCase() === country.toLowerCase()
    );
  }

  clearLocationRecords(): void {
    this.locationRecords.length = 0;
    this.logger.log('Location records cleared');
  }

  private extractClientIP(request: any): string {
    const xForwardedFor = request.headers['x-forwarded-for'];
    const xRealIP = request.headers['x-real-ip'];
    const connection = request.connection || request.socket;
    
    if (xForwardedFor) {
      return xForwardedFor.split(',')[0].trim();
    }
    
    if (xRealIP) {
      return xRealIP;
    }
    
    return connection.remoteAddress || request.ip || '127.0.0.1';
  }

  private isPrivateIP(ip: string): boolean {
    const privateRanges = [
      /^127\./,                    // 127.0.0.0/8 (localhost)
      /^10\./,                     // 10.0.0.0/8
      /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
      /^192\.168\./,               // 192.168.0.0/16
      /^::1$/,                     // IPv6 localhost
      /^fc00:/,                    // IPv6 unique local
      /^fe80:/,                    // IPv6 link local
    ];

    return privateRanges.some(range => range.test(ip)) || ip === '::1';
  }

  async processRequest(request: any, token?: string): Promise<LocationRecord> {
    const ip = this.extractClientIP(request);
    const userAgent = request.headers['user-agent'];
    
    return await this.logUserLocation(ip, userAgent, token);
  }
}