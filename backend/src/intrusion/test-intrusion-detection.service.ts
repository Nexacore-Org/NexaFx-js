import { Injectable } from '@nestjs/common';
import { IntrusionDetectionService } from './intrusion-detection.service';

@Injectable()
export class TestIntrusionDetectionService {
  constructor(
    private readonly intrusionDetectionService: IntrusionDetectionService,
  ) {}

  async simulateBotLoginPattern(): Promise<void> {
    const botUserAgent = 'Python/3.9 requests/2.25.1';
    const ipAddress = '192.168.1.100';
    
    console.log('Simulating bot-like login pattern...');
    
    // Simulate rapid login attempts
    for (let i = 0; i < 10; i++) {
      const result = await this.intrusionDetectionService.analyzeLoginAttempt(
        `bot-user-${i}`,
        ipAddress,
        botUserAgent,
        false, // Failed attempts
      );
      
      console.log(`Attempt ${i + 1}: Risk Score ${result.riskScore}, Suspicious: ${result.isSuspicious}`);
      
      if (result.reasons.length > 0) {
        console.log('Reasons:', result.reasons);
      }
      
      // Small delay between attempts
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async simulateIpHoppingPattern(): Promise<void> {
    const userId = 'test-user-123';
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    const ips = ['192.168.1.1', '10.0.0.1', '172.16.0.1', '203.0.113.1'];
    
    console.log('Simulating IP hopping pattern...');
    
    for (let i = 0; i < ips.length; i++) {
      const result = await this.intrusionDetectionService.analyzeLoginAttempt(
        userId,
        ips[i],
        userAgent,
        true,
      );
      
      console.log(`IP ${ips[i]}: Risk Score ${result.riskScore}, Suspicious: ${result.isSuspicious}`);
      
      if (result.reasons.length > 0) {
        console.log('Reasons:', result.reasons);
      }
      
      // Short delay between IP changes
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  async simulateLoginBurst(): Promise<void> {
    const ipAddress = '198.51.100.1';
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
    
    console.log('Simulating login burst pattern...');
    
    // Rapid login attempts from same IP
    for (let i = 0; i < 8; i++) {
      const result = await this.intrusionDetectionService.analyzeLoginAttempt(
        `user-${i}`,
        ipAddress,
        userAgent,
        i % 3 === 0, // Some successful, some failed
      );
      
      console.log(`Burst attempt ${i + 1}: Risk Score ${result.riskScore}, Suspicious: ${result.isSuspicious}`);
      
      if (result.reasons.length > 0) {
        console.log('Reasons:', result.reasons);
      }
      
      // Very short delay to simulate burst
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}
