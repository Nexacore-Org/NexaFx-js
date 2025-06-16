@Injectable()
export class TestFingerprintService {
  constructor(private fingerprintService: FingerprintAnalysisService) {}

  async testWithVariousUserAgents() {
    const testUserAgents = [
      // Normal browsers
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      
      // Suspicious/Bot-like
      'Mozilla/4.0',
      '',
      'Python/3.9 urllib3/1.26.6',
      'curl/7.68.0',
      'HeadlessChrome/91.0.4472.124',
      'Bot/1.0',
      
      // Mobile
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
    ];

    const results = [];
    
    for (const userAgent of testUserAgents) {
      const mockRequest = {
        headers: { 'user-agent': userAgent },
        ip: '192.168.1.100',
        connection: { remoteAddress: '192.168.1.100' }
      } as any;

      const analysis = await this.fingerprintService.analyzeRequest(mockRequest);
      results.push({
        userAgent,
        riskScore: analysis.riskScore,
        isSuspicious: analysis.isSuspicious,
        anomalies: analysis.anomalies.map(a => a.type)
      });
    }

    return results;
  }

  async simulateRapidRequests(userAgent: string, count: number = 150) {
    const mockRequest = {
      headers: { 'user-agent': userAgent },
      ip: '192.168.1.200',
      connection: { remoteAddress: '192.168.1.200' }
    } as any;

    const results = [];
    
    for (let i = 0; i < count; i++) {
      const analysis = await this.fingerprintService.analyzeRequest(mockRequest);
      if (i % 50 === 0) { // Log every 50th request
        results.push({
          requestNumber: i + 1,
          riskScore: analysis.riskScore,
          isSuspicious: analysis.isSuspicious,
          anomalies: analysis.anomalies.map(a => a.type)
        });
      }
    }

    return results;
  }
}

// test-fingerprint.controller.ts
@Controller('api/test-fingerprint')
export class TestFingerprintController {
  constructor(private testService: TestFingerprintService) {}

  @Get('user-agents')
  async testUserAgents() {
    return await this.testService.testWithVariousUserAgents();
  }

  @Get('rapid-requests')
  async testRapidRequests(@Query('count') count = 150) {
    return await this.testService.simulateRapidRequests(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      parseInt(count.toString())
    );
  }
}