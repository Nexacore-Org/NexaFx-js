const PII_KEYS = ['email', 'phone', 'name'];

export function scrubPII(data: any): any {
  try {
    if (!data || typeof data !== 'object') return data;

    const clone = Array.isArray(data) ? [] : {};

    for (const key in data) {
      if (PII_KEYS.includes(key.toLowerCase())) {
        clone[key] = '[REDACTED]';
      } else if (typeof data[key] === 'object') {
        clone[key] = scrubPII(data[key]);
      } else {
        clone[key] = data[key];
      }
    }

    return clone;
  } catch {
    return '[REDACTED]';
  }
}