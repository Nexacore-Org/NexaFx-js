import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StellarService } from './stellar.service';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import axios from 'axios';
import { isValidStellarAccountId, MAX_MEMO_ID } from './stellar-address.util';

/** A structurally valid Ed25519 public key (G...). */
const VALID_G = 'GDVV4DSLYPSC43RAYBTTH2EGC3P5R6WRCYZUFODLNZ3MUG5B6FV2JYZR';
/** A valid muxed account (M...). */
const VALID_M =
  'MDZV7TUCJYVRLMBZBYZTGKDJ5MCBLXRAMBOC64SRMFTYIUDCHOPVIAAAAAAAAAAAAGSAM';
/** Same key with one character changed → checksum fails. */
const INVALID_G = 'GDVV4DSLYPSC43RAYBTTH2EGC3P5R6WRCYZUFODLNZ3MUG5B6FV2JYZZ';

describe('StellarService (#1440)', () => {
  let service: StellarService;
  let cacheGet: jest.Mock;
  let cacheSet: jest.Mock;
  let axiosGet: jest.SpyInstance;
  let mockedAxios: { get: jest.SpyInstance };

  beforeEach(async () => {
    cacheGet = jest.fn().mockResolvedValue(undefined);
    cacheSet = jest.fn().mockResolvedValue(undefined);
    axiosGet = jest.spyOn(axios, 'get');
    mockedAxios = { get: axiosGet };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockReturnValue('https://horizon-testnet.stellar.org'),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: { get: cacheGet, set: cacheSet },
        },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
    jest.clearAllMocks();
    cacheGet.mockResolvedValue(undefined);
  });

  afterEach(() => {
    axiosGet.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isValidStellarAccountId', () => {
    it.each([VALID_G, VALID_M])('accepts %s', (address) => {
      expect(isValidStellarAccountId(address)).toBe(true);
    });

    it.each([
      ['a bad-checksum G address', INVALID_G],
      ['an empty string', ''],
      ['a path traversal attempt', '../ledgers/1'],
      ['an account with a query string', `${VALID_G}?x=`],
      ['a random word', 'not-an-address'],
    ])('rejects %s', (_label, address) => {
      expect(isValidStellarAccountId(address)).toBe(false);
    });
  });

  describe('accountExists', () => {
    it('returns the cached value without calling Horizon', async () => {
      cacheGet.mockResolvedValue(true);

      await expect(service.accountExists(VALID_G)).resolves.toBe(true);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('makes no Horizon request for an invalid account id', async () => {
      await expect(
        service.accountExists('../ledgers/1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(cacheSet).not.toHaveBeenCalled();
    });

    it('rejects a bad-checksum address before any HTTP call', async () => {
      await expect(service.accountExists(INVALID_G)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('URI-encodes the account id in the Horizon path', async () => {
      mockedAxios.get.mockResolvedValue({ status: 200 });

      await service.accountExists(VALID_G);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        `https://horizon-testnet.stellar.org/accounts/${VALID_G}`,
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it('caches a successful lookup as true', async () => {
      mockedAxios.get.mockResolvedValue({ status: 200 });

      await expect(service.accountExists(VALID_G)).resolves.toBe(true);
      expect(cacheSet).toHaveBeenCalledWith(
        `stellar:account-exists:${VALID_G}`,
        true,
        expect.any(Number),
      );
    });

    it('caches a 404 lookup as false', async () => {
      mockedAxios.get.mockRejectedValue(new Error('404 Not Found'));

      await expect(service.accountExists(VALID_G)).resolves.toBe(false);
      expect(cacheSet).toHaveBeenCalledWith(
        `stellar:account-exists:${VALID_G}`,
        false,
        expect.any(Number),
      );
    });
  });

  describe('validateAndFormatMemo', () => {
    it('accepts a text memo within 28 bytes', () => {
      expect(service.validateAndFormatMemo('text', 'payment-ref-123')).toEqual({
        type: 'text',
        value: 'payment-ref-123',
        valid: true,
      });
    });

    it('measures text memos in bytes, not characters', () => {
      // 14 four-byte emoji = 56 bytes but only 28 UTF-16 code units. The old
      // character-count check (length > 28) let this through.
      const emoji = '😀'.repeat(14);
      expect(emoji.length).toBeLessThanOrEqual(28);
      expect(Buffer.byteLength(emoji, 'utf8')).toBe(56);

      expect(() => service.validateAndFormatMemo('text', emoji)).toThrow(
        BadRequestException,
      );
    });

    it('rejects a text memo longer than 28 bytes with a 400', () => {
      expect(() =>
        service.validateAndFormatMemo('text', 'x'.repeat(29)),
      ).toThrow(BadRequestException);
      expect(() =>
        service.validateAndFormatMemo('text', 'x'.repeat(29)),
      ).toThrow('Stellar text memo cannot exceed 28 bytes');
    });

    it('accepts an id memo at the 2^64-1 boundary', () => {
      expect(
        service.validateAndFormatMemo('id', MAX_MEMO_ID.toString()),
      ).toEqual({
        type: 'id',
        value: MAX_MEMO_ID.toString(),
        valid: true,
      });
    });

    it('rejects a non-numeric id memo', () => {
      expect(() => service.validateAndFormatMemo('id', '12a')).toThrow(
        BadRequestException,
      );
    });

    it('rejects an id memo above 2^64-1', () => {
      const tooBig = (2n ** 64n).toString();
      expect(() => service.validateAndFormatMemo('id', tooBig)).toThrow(
        BadRequestException,
      );
    });

    it('accepts a 64-hex-character hash memo', () => {
      const hash = 'a'.repeat(64);
      expect(service.validateAndFormatMemo('hash', hash)).toEqual({
        type: 'hash',
        value: hash,
        valid: true,
      });
    });

    it('rejects a hash memo that is not 64 hex characters', () => {
      expect(() =>
        service.validateAndFormatMemo('hash', 'a'.repeat(63)),
      ).toThrow(BadRequestException);
      expect(() =>
        service.validateAndFormatMemo('hash', 'z'.repeat(64)),
      ).toThrow(BadRequestException);
      expect(() => service.validateAndFormatMemo('hash', 'any-shape')).toThrow(
        BadRequestException,
      );
    });

    it('returns invalid (without throwing) when the memo is missing', () => {
      expect(service.validateAndFormatMemo('text', '')).toEqual({
        type: 'text',
        value: '',
        valid: false,
      });
    });
  });
});
