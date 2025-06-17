import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';

@Injectable()
export class FingerprintAnalysisService {
  private readonly logger = new Logger(FingerprintAnalysisService.name);

  constructor(
    @InjectRepository(DeviceFingerprint)
    private fingerprintRepository: Repository<DeviceFingerprint>,
    
    @InjectRepository(SuspiciousActivity)
    private suspiciousActivityRepository: Repository<SuspiciousActivity>
  ) {}

  async analyzeRequest(req: Request): Promise<FingerprintAnalysisDto> {
    const fingerprint = FingerprintUtil.generateFingerprint(req);
    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = req.ip || req.connection.remoteAddress || '';

    // Get or create device fingerprint record
    let deviceRecord = await this.fingerprintRepository.findOne({
      where: { fingerprint }
    });

    if (!deviceRecord) {
      deviceRecord = await this.createNewDeviceRecord(req, fingerprint);
    } else {
      await this.updateDeviceRecord(deviceRecord, req);
    }

    // Analyze for anomalies
    const deviceInfo = UserAgentAnalyzer.analyzeUserAgent(userAgent);
    const anomalies = await this.detectAnomalies(deviceRecord, req, deviceInfo);
    const riskScore = this.calculateRiskScore(anomalies, deviceRecord);

    // Update suspicious status if needed
    if (anomalies.length > 0) {
      await this.flagSuspiciousDevice(deviceRecord, anomalies);
    }

    return {
      fingerprint,
      userAgent,
      ipAddress,
      isSuspicious: deviceRecord.isSuspicious,
      suspiciousReasons: deviceRecord.suspiciousReasons?.split(';') || [],
      riskScore,
      deviceInfo,
      anomalies
    };
  }

  private async createNewDeviceRecord(req: Request, fingerprint: string): Promise<DeviceFingerprint> {
    const deviceRecord = new DeviceFingerprint();
    deviceRecord.fingerprint = fingerprint;
    deviceRecord.userAgent = req.headers['user-agent'] || '';
    deviceRecord.ipAddress = req.ip || req.connection.remoteAddress || '';
    deviceRecord.acceptLanguage = req.headers['accept-language'] as string;
    deviceRecord.acceptEncoding = req.headers['accept-encoding'] as string;
    deviceRecord.connection = req.headers.connection as string;
    deviceRecord.headers = FingerprintUtil.extractHeaders(req);
    deviceRecord.requestCount = 1;
    deviceRecord.firstSeenAt = new Date();
    deviceRecord.lastSeenAt = new Date();

    return await this.fingerprintRepository.save(deviceRecord);
  }

  private async updateDeviceRecord(deviceRecord: DeviceFingerprint, req: Request): Promise<void> {
    deviceRecord.requestCount += 1;
    deviceRecord.lastSeenAt = new Date();
    
    // Update headers if they've changed
    const currentHeaders = FingerprintUtil.extractHeaders(req);
    if (JSON.stringify(deviceRecord.headers) !== JSON.stringify(currentHeaders)) {
      deviceRecord.headers = currentHeaders;
    }

    await this.fingerprintRepository.save(deviceRecord);
  }

  private async detectAnomalies(
    deviceRecord: DeviceFingerprint, 
    req: Request, 
    deviceInfo: DeviceInfo
  ): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];

    // Check for bot-like behavior
    if (deviceInfo.isBot) {
      anomalies.push({
        type: 'BOT_DETECTED',
        description: 'User agent indicates automated/bot behavior',
        severity: 'MEDIUM',
        confidence: 0.8
      });
    }

    // Check for suspicious user agent patterns
    if (this.isSuspiciousUserAgent(deviceRecord.userAgent)) {
      anomalies.push({
        type: 'SUSPICIOUS_USER_AGENT',
        description: 'User agent contains suspicious patterns',
        severity: 'HIGH',
        confidence: 0.9
      });
    }

    // Check for rapid requests (potential bot behavior)
    if (await this.isRapidRequesting(deviceRecord)) {
      anomalies.push({
        type: 'RAPID_REQUESTS',
        description: 'Unusually high request frequency detected',
        severity: 'HIGH',
        confidence: 0.85
      });
    }

    // Check for header inconsistencies
    const headerAnomalies = this.detectHeaderAnomalies(deviceRecord, deviceInfo);
    anomalies.push(...headerAnomalies);

    // Check for IP reputation (simplified)
    if (await this.isSuspiciousIP(deviceRecord.ipAddress)) {
      anomalies.push({
        type: 'SUSPICIOUS_IP',
        description: 'IP address has suspicious activity history',
        severity: 'MEDIUM',
        confidence: 0.7
      });
    }

    return anomalies;
  }

  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /^$/,  // Empty
      /^Mozilla\/4\.0$/,  // Too basic
      /HeadlessChrome/i,
      /PhantomJS/i,
      /SlimerJS/i,
      /^Python/i,
      /^Java/i,
      /curl/i,
      /wget/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  private async isRapidRequesting(deviceRecord: DeviceFingerprint): Promise<boolean> {
    const timeDiff = deviceRecord.lastSeenAt.getTime() - deviceRecord.firstSeenAt.getTime();
    const minutes = timeDiff / (1000 * 60);
    
    // More than 100 requests in 10 minutes is suspicious
    return deviceRecord.requestCount > 100 && minutes < 10;
  }

  private detectHeaderAnomalies(deviceRecord: DeviceFingerprint, deviceInfo: DeviceInfo): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Check if mobile device has desktop user agent or vice versa
    const userAgent = deviceRecord.userAgent.toLowerCase();
    const hasMobileHeaders = deviceRecord.headers['sec-ch-ua-mobile'] === '?1';
    
    if (deviceInfo.isMobile && !hasMobileHeaders && !userAgent.includes('mobile')) {
      anomalies.push({
        type: 'MOBILE_DESKTOP_MISMATCH',
        description: 'Mobile device indicators don\'t match user agent',
        severity: 'MEDIUM',
        confidence: 0.7
      });
    }

    // Check for missing common headers
    const expectedHeaders = ['accept', 'accept-language', 'accept-encoding'];
    const missingHeaders = expectedHeaders.filter(header => !deviceRecord.headers[header]);
    
    if (missingHeaders.length > 1) {
      anomalies.push({
        type: 'MISSING_HEADERS',
        description: `Missing common headers: ${missingHeaders.join(', ')}`,
        severity: 'MEDIUM',
        confidence: 0.6
      });
    }

    return anomalies;
  }

  private async isSuspiciousIP(ipAddress: string): Promise<boolean> {
    // Check if this IP has been flagged before
    const suspiciousCount = await this.fingerprintRepository.count({
      where: { ipAddress, isSuspicious: true }
    });

    return suspiciousCount > 0;
  }

  private calculateRiskScore(anomalies: Anomaly[], deviceRecord: DeviceFingerprint): number {
    let score = 0;

    anomalies.forEach(anomaly => {
      switch (anomaly.severity) {
        case 'LOW': score += 10 * anomaly.confidence; break;
        case 'MEDIUM': score += 25 * anomaly.confidence; break;
        case 'HIGH': score += 50 * anomaly.confidence; break;
        case 'CRITICAL': score += 100 * anomaly.confidence; break;
      }
    });

    // Factor in request frequency
    if (deviceRecord.requestCount > 1000) score += 20;

    return Math.min(score, 100); // Cap at 100
  }

  private async flagSuspiciousDevice(deviceRecord: DeviceFingerprint, anomalies: Anomaly[]): Promise<void> {
    const reasons = anomalies.map(a => a.description).join('; ');
    
    deviceRecord.isSuspicious = true;
    deviceRecord.suspiciousReasons = reasons;
    
    await this.fingerprintRepository.save(deviceRecord);

    // Log suspicious activity
    for (const anomaly of anomalies) {
      await this.logSuspiciousActivity(deviceRecord.fingerprint, anomaly);
    }

    this.logger.warn(`Suspicious device flagged: ${deviceRecord.fingerprint}`, { reasons });
  }

  private async logSuspiciousActivity(fingerprint: string, anomaly: Anomaly): Promise<void> {
    const activity = new SuspiciousActivity();
    activity.fingerprint = fingerprint;
    activity.activityType = anomaly.type;
    activity.description = anomaly.description;
    activity.severity = anomaly.severity;
    activity.metadata = { confidence: anomaly.confidence };

    await this.suspiciousActivityRepository.save(activity);
  }

  // Admin methods for monitoring
  async getSuspiciousDevices(limit = 50): Promise<DeviceFingerprint[]> {
    return await this.fingerprintRepository.find({
      where: { isSuspicious: true },
      order: { updatedAt: 'DESC' },
      take: limit
    });
  }

  async getDeviceStats() {
    const total = await this.fingerprintRepository.count();
    const suspicious = await this.fingerprintRepository.count({ where: { isSuspicious: true } });
    const recentActivity = await this.suspiciousActivityRepository.count({
      where: { detectedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    });

    return { total, suspicious, suspiciousRate: (suspicious / total) * 100, recentActivity };
  }
}