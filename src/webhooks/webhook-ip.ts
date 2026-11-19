import { isIPv4, isIPv6 } from 'net';
import { promises as dns } from 'dns';

/**
 * IP classification for webhook endpoints (#1608). Used both when an endpoint
 * is registered and immediately before every delivery, so a DNS answer that
 * changed after registration cannot reach internal services.
 */

const BLOCKED_V4_RANGES: Array<[number, number]> = [
  [ipv4ToInt('0.0.0.0'), ipv4ToInt('0.255.255.255')],
  [ipv4ToInt('10.0.0.0'), ipv4ToInt('10.255.255.255')],
  [ipv4ToInt('100.64.0.0'), ipv4ToInt('100.127.255.255')], // CGNAT
  [ipv4ToInt('127.0.0.0'), ipv4ToInt('127.255.255.255')],
  [ipv4ToInt('169.254.0.0'), ipv4ToInt('169.254.255.255')],
  [ipv4ToInt('172.16.0.0'), ipv4ToInt('172.31.255.255')],
  [ipv4ToInt('192.0.0.0'), ipv4ToInt('192.0.0.255')],
  [ipv4ToInt('192.0.2.0'), ipv4ToInt('192.0.2.255')],
  [ipv4ToInt('192.168.0.0'), ipv4ToInt('192.168.255.255')],
  [ipv4ToInt('198.18.0.0'), ipv4ToInt('198.19.255.255')],
  [ipv4ToInt('198.51.100.0'), ipv4ToInt('198.51.100.255')],
  [ipv4ToInt('203.0.113.0'), ipv4ToInt('203.0.113.255')],
  [ipv4ToInt('224.0.0.0'), ipv4ToInt('255.255.255.255')],
];

function ipv4ToInt(ip: string): number {
  const octets = ip.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return -1;
  }
  const [a, b, c, d] = octets as [number, number, number, number];
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value < 0) return true;
  return BLOCKED_V4_RANGES.some(([start, end]) => value >= start && value <= end);
}

/** Expands a textual IPv6 address into eight 16-bit groups. */
function expandIpv6(ip: string): number[] | null {
  if (!isIPv6(ip)) return null;
  const address = (ip.split('%')[0] ?? ip).toLowerCase();
  const halves = address.split('::');
  if (halves.length > 2) return null;

  const groupsOf = (part: string): number[] | null => {
    if (!part) return [];
    const groups: number[] = [];
    for (const token of part.split(':')) {
      if (token.includes('.')) {
        if (!isIPv4(token)) return null;
        const [a, b, c, d] = token.split('.').map(Number) as [
          number,
          number,
          number,
          number,
        ];
        groups.push(((a << 8) | b) & 0xffff, ((c << 8) | d) & 0xffff);
      } else {
        const value = parseInt(token, 16);
        if (Number.isNaN(value) || value > 0xffff) return null;
        groups.push(value);
      }
    }
    return groups;
  };

  const head = groupsOf(halves[0] ?? '');
  const tail = halves.length === 2 ? groupsOf(halves[1] ?? '') : [];
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  return [...head, ...new Array(missing).fill(0), ...tail];
}

function isBlockedIpv6(ip: string): boolean {
  const expanded = expandIpv6(ip);
  if (!expanded) return true;
  const [a, b, c, , , f, h, i] = expanded as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  // Unspecified and loopback.
  if (expanded.every((group) => group === 0)) return true;
  if (expanded.slice(0, 7).every((group) => group === 0) && i === 1) return true;

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d).
  if (expanded.slice(0, 5).every((group) => group === 0) && f === 0xffff) {
    return isBlockedIpv4(`${h >> 8}.${h & 0xff}.${i >> 8}.${i & 0xff}`);
  }
  if (expanded.slice(0, 6).every((group) => group === 0)) return true;

  // Unique-local, link-local, legacy site-local and multicast.
  if ((a & 0xfe00) === 0xfc00) return true;
  if ((a & 0xffc0) === 0xfe80 || (a & 0xffc0) === 0xfec0) return true;
  if ((a & 0xff00) === 0xff00) return true;

  // Documentation and benchmarking ranges have no place in a delivery URL.
  if (a === 0x2001 && b === 0x0db8) return true;
  if (a === 0x2001 && b === 0x0002) return true; // Teredo (embeds an IPv4 host)
  if (a === 0x2001 && b === 0x0001) return true; // ORCHID

  // NAT64 well-known prefix: the last 32 bits are the embedded IPv4 address.
  if (a === 0x0064 && b === 0xff9b && c === 0) {
    return isBlockedIpv4(`${h >> 8}.${h & 0xff}.${i >> 8}.${i & 0xff}`);
  }
  // 6to4: the next 32 bits are the embedded IPv4 address.
  if (a === 0x2002) {
    return isBlockedIpv4(`${b >> 8}.${b & 0xff}.${c >> 8}.${c & 0xff}`);
  }
  return false;
}

/** True for any address a customer-controlled webhook must never reach. */
export function isBlockedWebhookIp(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '');
  if (isIPv4(ip)) return isBlockedIpv4(ip);
  if (isIPv6(ip)) return isBlockedIpv6(ip);
  return true;
}

/** Resolve both A and AAAA records; a literal IP is returned unchanged. */
export async function resolveWebhookAddresses(hostname: string): Promise<string[]> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIpAddress(host)) return [host];

  const [v4, v6] = await Promise.allSettled([
    dns.resolve4(host),
    dns.resolve6(host),
  ]);
  const addresses = [
    ...(v4.status === 'fulfilled' ? v4.value : []),
    ...(v6.status === 'fulfilled' ? v6.value : []),
  ];
  if (addresses.length === 0) {
    throw new Error(`Unable to resolve webhook host "${hostname}"`);
  }
  return addresses;
}

export function isIpAddress(value: string): boolean {
  return isIPv4(value) || isIPv6(value);
}

/** Throws when any resolved address is unsafe. */
export function assertPublicWebhookAddresses(addresses: string[]): string {
  let first: string | undefined;
  for (const address of addresses) {
    if (isBlockedWebhookIp(address)) {
      throw new Error(
        `Webhook host resolves to a private/internal address (${address}) — SSRF not permitted`,
      );
    }
    first ??= address;
  }
  if (!first) throw new Error('Webhook host resolved to no addresses');
  return first;
}
