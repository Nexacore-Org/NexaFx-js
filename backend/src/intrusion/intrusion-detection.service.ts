import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface SuspiciousActivity {
  id?: string;
  userId?: string;
  ipAddress: string;
  userAgent: string;
  activityType: 'LOGIN_ATTEMPT' | 'FAILED_LOGIN' | 'IP_CHANGE' | 'RAPID_REQUESTS';
  timestamp: Date;
  details?: any;
  riskScore: number;
}

export interface DetectionResult {
  isSuspicious: boolean;
  riskScore: number;
  reasons: string[];
  recommendations: string[];
}

@Injectable()
export class IntrusionDetectionService {
  private readonly logger = new Logger(IntrusionDetectionService.name);
  private readonly activityBuffer = new Map<string, SuspiciousActivity[]>();
  private readonly ipBuffer = new Map<string, Date[]>();
  private readonly userBuffer = new Map<string, SuspiciousActivity[]>();

  // Configuration
  private readonly config = {
    maxLoginAttemptsPerMinute: 5,
    maxLoginAttemptsPerHour: 20,
    maxIpChangesPerHour: 3,
    suspiciousRiskThreshold: 70,
    criticalRiskThreshold: 90,
    bufferCleanupInterval: 60 * 60 * 1000, // 1 hour
  };

  constructor(
    @InjectRepository(SuspiciousActivity)
    private readonly suspiciousActivityRepo: Repository<SuspiciousActivity>,
  ) {}

  async analyzeLoginAttempt(
    userId: string,
    ipAddress: string,
    userAgent: string,
    success: boolean,
  ): Promise<DetectionResult> {
    const activity: SuspiciousActivity = {
      userId,
      ipAddress,
      userAgent,
      activityType: success ? 'LOGIN_ATTEMPT' : 'FAILED_LOGIN',
      timestamp: new Date(),
      riskScore: 0,
    };

    const detectionResult = await this.detectSuspiciousPatterns(activity);
    
    if (detectionResult.isSuspicious) {
      await this.logSuspiciousActivity(activity, detectionResult.riskScore);
    }

    this.updateBuffers(activity);
    return detectionResult;
  }

  private async detectSuspiciousPatterns(
    activity: SuspiciousActivity,
  ): Promise<DetectionResult> {
    const reasons: string[] = [];
    let riskScore = 0;
    const recommendations: string[] = [];

    // Check login burst patterns
    const loginBurstResult = this.detectLoginBurst(activity);
    if (loginBurstResult.detected) {
      reasons.push(loginBurstResult.reason);
      riskScore += loginBurstResult.score;
      recommendations.push('Consider implementing rate limiting');
    }

    // Check IP hopping
    const ipHoppingResult = await this.detectIpHopping(activity);
    if (ipHoppingResult.detected) {
      reasons.push(ipHoppingResult.reason);
      riskScore += ipHoppingResult.score;
      recommendations.push('Verify user identity with additional authentication');
    }

    // Check for bot-like patterns
    const botPatternResult = this.detectBotPatterns(activity);
    if (botPatternResult.detected) {
      reasons.push(botPatternResult.reason);
      riskScore += botPatternResult.score;
      recommendations.push('Consider implementing CAPTCHA');
    }

    // Check for unusual timing patterns
    const timingResult = this.detectUnusualTiming(activity);
    if (timingResult.detected) {
      reasons.push(timingResult.reason);
      riskScore += timingResult.score;
      recommendations.push('Monitor for automated attacks');
    }

    return {
      isSuspicious: riskScore >= this.config.suspiciousRiskThreshold,
      riskScore: Math.min(riskScore, 100),
      reasons,
      recommendations,
    };
  }

  private detectLoginBurst(activity: SuspiciousActivity): {
    detected: boolean;
    reason: string;
    score: number;
  } {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Check IP-based bursts
    const ipActivities = this.ipBuffer.get(activity.ipAddress) || [];
    const recentIpAttempts = ipActivities.filter(
      timestamp => timestamp > oneMinuteAgo,
    ).length;
    const hourlyIpAttempts = ipActivities.filter(
      timestamp => timestamp > oneHourAgo,
    ).length;

    if (recentIpAttempts >= this.config.maxLoginAttemptsPerMinute) {
      return {
        detected: true,
        reason: `Login burst detected: ${recentIpAttempts} attempts in 1 minute from IP ${activity.ipAddress}`,
        score: 40,
      };
    }

    if (hourlyIpAttempts >= this.config.maxLoginAttemptsPerHour) {
      return {
        detected: true,
        reason: `High login frequency: ${hourlyIpAttempts} attempts in 1 hour from IP ${activity.ipAddress}`,
        score: 30,
      };
    }

    // Check user-based bursts
    if (activity.userId) {
      const userActivities = this.userBuffer.get(activity.userId) || [];
      const recentUserAttempts = userActivities.filter(
        act => act.timestamp > oneMinuteAgo,
      ).length;

      if (recentUserAttempts >= this.config.maxLoginAttemptsPerMinute) {
        return {
          detected: true,
          reason: `User login burst: ${recentUserAttempts} attempts in 1 minute`,
          score: 35,
        };
      }
    }

    return { detected: false, reason: '', score: 0 };
  }

  private async detectIpHopping(activity: SuspiciousActivity): Promise<{
    detected: boolean;
    reason: string;
    score: number;
  }> {
    if (!activity.userId) {
      return { detected: false, reason: '', score: 0 };
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    // Get recent activities for this user
    const userActivities = this.userBuffer.get(activity.userId) || [];
    const recentActivities = userActivities.filter(
      act => act.timestamp > oneHourAgo,
    );

    // Count unique IPs
    const uniqueIps = new Set(recentActivities.map(act => act.ipAddress));
    uniqueIps.add(activity.ipAddress);

    if (uniqueIps.size > this.config.maxIpChangesPerHour) {
      return {
        detected: true,
        reason: `IP hopping detected: ${uniqueIps.size} different IPs in 1 hour`,
        score: 50,
      };
    }

    // Check for geographic impossibility (simplified)
    const ipChanges = recentActivities.filter(
      act => act.ipAddress !== activity.ipAddress,
    );
    
    if (ipChanges.length > 0) {
      const timeDiff = activity.timestamp.getTime() - 
        Math.max(...ipChanges.map(act => act.timestamp.getTime()));
      
      // If IP changed within 5 minutes, it's suspicious
      if (timeDiff < 5 * 60 * 1000) {
        return {
          detected: true,
          reason: 'Rapid IP address change detected',
          score: 35,
        };
      }
    }

    return { detected: false, reason: '', score: 0 };
  }

  private detectBotPatterns(activity: SuspiciousActivity): {
    detected: boolean;
    reason: string;
    score: number;
  } {
    const userAgent = activity.userAgent.toLowerCase();
    
    // Check for suspicious user agents
    const botIndicators = [
      'bot', 'crawler', 'spider', 'scraper', 'automated',
      'python', 'curl', 'wget', 'postman',
    ];
    
    const hasBotIndicator = botIndicators.some(indicator => 
      userAgent.includes(indicator),
    );
    
    if (hasBotIndicator) {
      return {
        detected: true,
        reason: `Bot-like user agent detected: ${activity.userAgent}`,
        score: 60,
      };
    }

    // Check for missing or suspicious user agent
    if (!activity.userAgent || activity.userAgent.length < 10) {
      return {
        detected: true,
        reason: 'Missing or minimal user agent',
        score: 40,
      };
    }

    return { detected: false, reason: '', score: 0 };
  }

  private detectUnusualTiming(activity: SuspiciousActivity): {
    detected: boolean;
    reason: string;
    score: number;
  } {
    const hour = activity.timestamp.getHours();
    
    // Flag activities during unusual hours (2 AM - 5 AM)
    if (hour >= 2 && hour <= 5) {
      return {
        detected: true,
        reason: `Unusual timing: Activity at ${hour}:00`,
        score: 15,
      };
    }

    return { detected: false, reason: '', score: 0 };
  }

  private updateBuffers(activity: SuspiciousActivity): void {
    // Update IP buffer
    const ipTimestamps = this.ipBuffer.get(activity.ipAddress) || [];
    ipTimestamps.push(activity.timestamp);
    this.ipBuffer.set(activity.ipAddress, ipTimestamps);

    // Update user buffer
    if (activity.userId) {
      const userActivities = this.userBuffer.get(activity.userId) || [];
      userActivities.push(activity);
      this.userBuffer.set(activity.userId, userActivities);
    }

    // Update activity buffer
    const allActivities = this.activityBuffer.get('global') || [];
    allActivities.push(activity);
    this.activityBuffer.set('global', allActivities);
  }

  private async logSuspiciousActivity(
    activity: SuspiciousActivity,
    riskScore: number,
  ): Promise<void> {
    activity.riskScore = riskScore;
    
    try {
      await this.suspiciousActivityRepo.save(activity);
      
      if (riskScore >= this.config.criticalRiskThreshold) {
        this.logger.error(
          `CRITICAL THREAT DETECTED: Risk Score ${riskScore} - ${activity.activityType} from ${activity.ipAddress}`,
        );
      } else {
        this.logger.warn(
          `Suspicious activity detected: Risk Score ${riskScore} - ${activity.activityType} from ${activity.ipAddress}`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to log suspicious activity', error);
    }
  }

  // Clean up old entries periodically
  @Cron(CronExpression.EVERY_HOUR)
  private cleanupBuffers(): void {
    const oneHourAgo = new Date(Date.now() - this.config.bufferCleanupInterval);
    
    // Clean IP buffer
    for (const [ip, timestamps] of this.ipBuffer.entries()) {
      const filteredTimestamps = timestamps.filter(ts => ts > oneHourAgo);
      if (filteredTimestamps.length === 0) {
        this.ipBuffer.delete(ip);
      } else {
        this.ipBuffer.set(ip, filteredTimestamps);
      }
    }

    // Clean user buffer
    for (const [userId, activities] of this.userBuffer.entries()) {
      const filteredActivities = activities.filter(act => act.timestamp > oneHourAgo);
      if (filteredActivities.length === 0) {
        this.userBuffer.delete(userId);
      } else {
        this.userBuffer.set(userId, filteredActivities);
      }
    }

    // Clean global activity buffer
    const globalActivities = this.activityBuffer.get('global') || [];
    const filteredGlobalActivities = globalActivities.filter(
      act => act.timestamp > oneHourAgo,
    );
    this.activityBuffer.set('global', filteredGlobalActivities);

    this.logger.debug('Buffer cleanup completed');
  }

  async getSuspiciousActivitiesByIp(ipAddress: string): Promise<SuspiciousActivity[]> {
    return this.suspiciousActivityRepo.find({
      where: { ipAddress },
      order: { timestamp: 'DESC' },
      take: 50,
    });
  }

  async getSuspiciousActivitiesByUser(userId: string): Promise<SuspiciousActivity[]> {
    return this.suspiciousActivityRepo.find({
      where: { userId },
      order: { timestamp: 'DESC' },
      take: 50,
    });
  }

  async getHighRiskActivities(minRiskScore: number = 70): Promise<SuspiciousActivity[]> {
    return this.suspiciousActivityRepo
      .createQueryBuilder('activity')
      .where('activity.riskScore >= :minRiskScore', { minRiskScore })
      .orderBy('activity.timestamp', 'DESC')
      .take(100)
      .getMany();
  }
}
