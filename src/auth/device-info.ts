export interface DeviceInfo {
  deviceName?: string;
  deviceOs?: string;
  ipAddress?: string;
}

const OS_PATTERNS: Array<[RegExp, string]> = [
  [/Windows NT/i, 'Windows'],
  [/Android/i, 'Android'],
  [/(iPhone|iPad|iPod)/i, 'iOS'],
  [/Mac OS X|Macintosh/i, 'macOS'],
  [/CrOS/i, 'ChromeOS'],
  [/Linux/i, 'Linux'],
];

// Order matters: Edge and Opera also contain "Chrome", Chrome also contains "Safari".
const BROWSER_PATTERNS: Array<[RegExp, string]> = [
  [/Edg(e|A|iOS)?\//i, 'Edge'],
  [/OPR\/|Opera/i, 'Opera'],
  [/Firefox\//i, 'Firefox'],
  [/(Chrome|CriOS)\//i, 'Chrome'],
  [/Safari\//i, 'Safari'],
];

function firstMatch(patterns: Array<[RegExp, string]>, input: string): string | undefined {
  return patterns.find(([re]) => re.test(input))?.[1];
}

/** Derive a human-readable device label from a user-agent string and client IP. */
export function parseDeviceInfo(context: { ip?: string; userAgent?: string } = {}): DeviceInfo {
  const ua = context.userAgent ?? '';
  const deviceOs = firstMatch(OS_PATTERNS, ua);
  const browser = firstMatch(BROWSER_PATTERNS, ua);

  const deviceName =
    browser && deviceOs ? `${browser} on ${deviceOs}` : (browser ?? deviceOs ?? undefined);

  return {
    deviceName,
    deviceOs,
    ipAddress: context.ip ? context.ip.slice(0, 45) : undefined,
  };
}
