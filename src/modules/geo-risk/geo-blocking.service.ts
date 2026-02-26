// src/modules/geo-risk/geo-blocking.service.ts
import { Injectable, ForbiddenException } from '@nestjs/common';
import axios from 'axios'; // For IP geolocation API

@Injectable()
export class GeoBlockingService {
  private restrictedCountries = ['KP', 'IR', 'SY']; // Example: North Korea, Iran, Syria

  async validateLocation(ip: string) {
    const response = await axios.get(`https://ipapi.co/${ip}/json/`);
    const country = response.data.country_code;

    if (this.restrictedCountries.includes(country)) {
      throw new ForbiddenException(`Transactions are blocked for jurisdiction: ${country}`);
    }
    return true;
  }
}