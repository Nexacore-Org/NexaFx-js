export class FingerprintAnalysisDto {
    fingerprint: string;
    userAgent: string;
    ipAddress: string;
    isSuspicious: boolean;
    suspiciousReasons: string[];
    riskScore: number;
    deviceInfo: DeviceInfo;
    anomalies: Anomaly[];
  }
  
  export interface DeviceInfo {
    browser: string;
    browserVersion: string;
    os: string;
    osVersion: string;
    device: string;
    isBot: boolean;
    isMobile: boolean;
  }
  
  export interface Anomaly {
    type: string;
    description: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    confidence: number;
  }