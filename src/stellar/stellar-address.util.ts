import { StrKey } from 'stellar-sdk';

/**
 * Pure Stellar address helpers shared by `StellarService` and the
 * `@IsStellarAddress()` DTO decorator (#1440).
 *
 * Kept free of Nest dependencies so it can be imported from validators without
 * pulling in the service's DI graph.
 */

/**
 * True when `address` is a well-formed Stellar account id:
 *  - `G...`  Ed25519 public key (the standard account id)
 *  - `M...`  muxed account (M-address), when supported by the SDK
 *
 * The StrKey checksum is verified, so a syntactically-plausible but corrupt key
 * is rejected. This is what callers must check *before* any Horizon request or
 * cache write.
 */
export function isValidStellarAccountId(address: unknown): address is string {
  if (typeof address !== 'string' || address.length === 0) {
    return false;
  }
  try {
    if (StrKey.isValidEd25519PublicKey(address)) {
      return true;
    }
    // Muxed accounts ("M...") are supported by stellar-sdk >= 10.
    if (
      typeof StrKey.isValidMed25519PublicKey === 'function' &&
      StrKey.isValidMed25519PublicKey(address)
    ) {
      return true;
    }
  } catch {
    // StrKey throws on some malformed inputs; treat as invalid.
    return false;
  }
  return false;
}

/** Largest value representable by a Stellar 64-bit id memo. */
export const MAX_MEMO_ID = 2n ** 64n - 1n;

/** A Stellar hash memo is exactly 32 bytes, i.e. 64 hex characters. */
export const MEMO_HASH_HEX_LENGTH = 64;

/** Maximum byte length of a Stellar text memo. */
export const MAX_TEXT_MEMO_BYTES = 28;
