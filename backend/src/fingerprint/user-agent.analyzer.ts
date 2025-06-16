export class UserAgentAnalyzer {
    private static readonly BOT_PATTERNS = [
      /bot/i, /crawler/i, /spider/i, /scraper/i, /curl/i, /wget/i,
      /python/i, /java/i, /go-http-client/i, /postman/i
    ];
  
    private static readonly SUSPICIOUS_PATTERNS = [
      /^$/,  // Empty user agent
      /^Mozilla\/4\.0$/,  // Very old/basic user agent
      /HeadlessChrome/i,  // Headless browsers
      /PhantomJS/i,
      /SlimerJS/i
    ];
  
    static analyzeUserAgent(userAgent: string): DeviceInfo {
      const isBot = this.isBot(userAgent);
      const isSuspicious = this.isSuspicious(userAgent);
      
      return {
        browser: this.extractBrowser(userAgent),
        browserVersion: this.extractBrowserVersion(userAgent),
        os: this.extractOS(userAgent),
        osVersion: this.extractOSVersion(userAgent),
        device: this.extractDevice(userAgent),
        isBot,
        isMobile: this.isMobile(userAgent)
      };
    }
  
    private static isBot(userAgent: string): boolean {
      return this.BOT_PATTERNS.some(pattern => pattern.test(userAgent));
    }
  
    private static isSuspicious(userAgent: string): boolean {
      return this.SUSPICIOUS_PATTERNS.some(pattern => pattern.test(userAgent));
    }
  
    private static isMobile(userAgent: string): boolean {
      return /Mobile|Android|iPhone|iPad/i.test(userAgent);
    }
  
    private static extractBrowser(userAgent: string): string {
      if (/Chrome/i.test(userAgent)) return 'Chrome';
      if (/Firefox/i.test(userAgent)) return 'Firefox';
      if (/Safari/i.test(userAgent)) return 'Safari';
      if (/Edge/i.test(userAgent)) return 'Edge';
      return 'Unknown';
    }
  
    private static extractBrowserVersion(userAgent: string): string {
      const chromeMatch = userAgent.match(/Chrome\/(\d+\.\d+)/);
      if (chromeMatch) return chromeMatch[1];
      
      const firefoxMatch = userAgent.match(/Firefox\/(\d+\.\d+)/);
      if (firefoxMatch) return firefoxMatch[1];
      
      return 'Unknown';
    }
  
    private static extractOS(userAgent: string): string {
      if (/Windows/i.test(userAgent)) return 'Windows';
      if (/Mac OS/i.test(userAgent)) return 'macOS';
      if (/Linux/i.test(userAgent)) return 'Linux';
      if (/Android/i.test(userAgent)) return 'Android';
      if (/iOS/i.test(userAgent)) return 'iOS';
      return 'Unknown';
    }
  
    private static extractOSVersion(userAgent: string): string {
      const windowsMatch = userAgent.match(/Windows NT (\d+\.\d+)/);
      if (windowsMatch) return windowsMatch[1];
      
      const macMatch = userAgent.match(/Mac OS X (\d+[._]\d+)/);
      if (macMatch) return macMatch[1].replace('_', '.');
      
      return 'Unknown';
    }
  
    private static extractDevice(userAgent: string): string {
      if (/iPhone/i.test(userAgent)) return 'iPhone';
      if (/iPad/i.test(userAgent)) return 'iPad';
      if (/Android/i.test(userAgent)) return 'Android Device';
      return 'Desktop';
    }
  }
  