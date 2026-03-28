// Utility for PII scrubbing
export function isPIIKey(key: string): boolean {
  return ['email', 'phone', 'ssn', 'account', 'iban', 'card', 'address', 'dob', 'name'].some((pii) => key.toLowerCase().includes(pii));
}

export function scrubPIIFromUrl(url: string): string {
  try {
    const [path, query] = url.split('?');
    if (!query) return url;
    const params = new URLSearchParams(query);
    for (const key of params.keys()) {
      if (isPIIKey(key)) params.set(key, '[REDACTED]');
    }
    return `${path}?${params.toString()}`;
  } catch {
    return url;
  }
}
