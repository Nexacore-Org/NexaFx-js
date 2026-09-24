import { UnauthorizedException } from '@nestjs/common';
import {
  generateKeyPairSync,
  sign as cryptoSign,
  KeyObject,
} from 'crypto';
import { Sep10AuthService } from './sep10-auth.service';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const crc16Xmodem = (data: Buffer): number => {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
};

const base32Encode = (data: Buffer): string => {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
};

/** Builds the "G..." StrKey address for a raw Ed25519 public key. */
const toStellarAddress = (rawPublicKey: Buffer): string => {
  const payload = Buffer.concat([Buffer.from([6 << 3]), rawPublicKey]);
  const checksum = Buffer.alloc(2);
  checksum.writeUInt16LE(crc16Xmodem(payload));
  return base32Encode(Buffer.concat([payload, checksum]));
};

const makeKeypair = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawPublicKey = publicKey
    .export({ format: 'der', type: 'spki' })
    .subarray(12);
  return {
    privateKey,
    rawPublicKey: Buffer.from(rawPublicKey),
    address: toStellarAddress(Buffer.from(rawPublicKey)),
  };
};

const signChallenge = (challenge: string, privateKey: KeyObject): string =>
  cryptoSign(null, Buffer.from(challenge, 'utf8'), privateKey).toString(
    'base64',
  );

describe('Sep10AuthService', () => {
  let service: Sep10AuthService;

  beforeEach(() => {
    service = new Sep10AuthService({} as any, {} as any);
  });

  it('verifies a challenge signed by a real Stellar keypair', () => {
    const { address, privateKey } = makeKeypair();

    const { challenge } = service.generateChallenge(address);

    expect(
      service.validateChallenge(address, signChallenge(challenge, privateKey)),
    ).toBe(true);
  });

  it('rejects a tampered signature', () => {
    const { address, privateKey } = makeKeypair();

    const { challenge } = service.generateChallenge(address);
    const signature = Buffer.from(
      signChallenge(challenge, privateKey),
      'base64',
    );
    signature[0] ^= 0xff;

    expect(
      service.validateChallenge(address, signature.toString('base64')),
    ).toBe(false);
  });

  it('rejects a signature produced by a different keypair', () => {
    const { address } = makeKeypair();
    const attacker = makeKeypair();

    const { challenge } = service.generateChallenge(address);

    expect(
      service.validateChallenge(
        address,
        signChallenge(challenge, attacker.privateKey),
      ),
    ).toBe(false);
  });

  it('rejects a signature over a different challenge payload', () => {
    const { address, privateKey } = makeKeypair();

    service.generateChallenge(address);

    expect(
      service.validateChallenge(
        address,
        signChallenge('some other payload', privateKey),
      ),
    ).toBe(false);
  });

  it('accepts a base64-encoded raw Ed25519 key as well as a StrKey address', () => {
    const { rawPublicKey, privateKey } = makeKeypair();
    const base64Key = rawPublicKey.toString('base64');

    const { challenge } = service.generateChallenge(base64Key);

    expect(
      service.validateChallenge(base64Key, signChallenge(challenge, privateKey)),
    ).toBe(true);
  });

  it('rejects a StrKey address whose checksum does not match', () => {
    const { address, privateKey } = makeKeypair();
    const { challenge } = service.generateChallenge(address);
    const signature = signChallenge(challenge, privateKey);

    const corrupted =
      address.slice(0, -1) + (address.endsWith('A') ? 'B' : 'A');
    service.generateChallenge(corrupted);

    expect(() => service.validateChallenge(corrupted, signature)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a signature of the wrong length', () => {
    const { address } = makeKeypair();
    service.generateChallenge(address);

    expect(() =>
      service.validateChallenge(address, Buffer.alloc(10).toString('base64')),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a second use of the same challenge', () => {
    const { address, privateKey } = makeKeypair();
    const { challenge } = service.generateChallenge(address);
    const signature = signChallenge(challenge, privateKey);

    expect(service.validateChallenge(address, signature)).toBe(true);
    expect(() => service.validateChallenge(address, signature)).toThrow(
      UnauthorizedException,
    );
  });
});
