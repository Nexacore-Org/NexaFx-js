export interface StellarAssetIssuer {
  code: string;
  issuerAddress: string;
}

const STELLAR_ISSUERS_RAW = (
  process.env.STELLAR_ASSET_ISSUERS ?? ''
).trim();

function parseStellarIssuers(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const pair of raw.split(',')) {
    const [code, issuer] = pair.trim().split(':');
    if (code && issuer) {
      map.set(code.toUpperCase(), issuer.trim());
    }
  }
  return map;
}

const STELLAR_ISSUER_MAP = parseStellarIssuers(STELLAR_ISSUERS_RAW);

export function getStellarIssuer(currencyCode: string): string {
  const issuer = STELLAR_ISSUER_MAP.get(currencyCode.toUpperCase());
  if (!issuer) {
    throw new Error(
      `No Stellar issuer address configured for ${currencyCode}. ` +
        'Set STELLAR_ASSET_ISSUERS=CODE:GADDRESS,...',
    );
  }
  return issuer;
}
