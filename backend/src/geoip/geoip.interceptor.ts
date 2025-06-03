import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
  } from '@nestjs/common';
  import { Observable } from 'rxjs';
  import { tap } from 'rxjs/operators';
  import { GeoipService } from './geoip.service';
  
  @Injectable()
  export class GeoipInterceptor implements NestInterceptor {
    private readonly logger = new Logger(GeoipInterceptor.name);
  
    constructor(private readonly geoipService: GeoipService) {}
  
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
      const request = context.switchToHttp().getRequest();
      const startTime = Date.now();
  
      // Skip logging for certain routes to avoid recursion

      const skipRoutes = ['/geoip', '/health', '/metrics'];
      const shouldSkip = skipRoutes.some(route => request.url.startsWith(route));
  
      if (shouldSkip) {
        return next.handle();
      }
  
      return next.handle().pipe(
        tap({
          next: () => {
            // Log geolocation after successful request

            this.logGeoLocation(request).catch(error => {
              this.logger.error('Failed to log geolocation:', error.message);
            });
          },
          error: (error) => {
            // Still log geolocation even if request failed
            
            this.logGeoLocation(request).catch(logError => {
              this.logger.error('Failed to log geolocation on error:', logError.message);
            });
          },
        }),
      );
    }
  
    private async logGeoLocation(request: any): Promise<void> {
      try {
        const token = process.env.IPINFO_TOKEN; // Optional: Add your ipinfo.io token
        await this.geoipService.processRequest(request, token);
      } catch (error) {
        this.logger.error('Geolocation logging failed:', error.message);
      }
    }
  }