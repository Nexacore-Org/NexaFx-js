import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;
  const mockEncryptionKey = 'test-encryption-key-for-testing-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ENCRYPTION_KEY') return mockEncryptionKey;
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const plainText = '123 Main St, City, State 12345';
      const encrypted = service.encrypt(plainText);
      const decrypted = service.decrypt(encrypted);

      expect(encrypted).not.toBe(plainText);
      expect(encrypted).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);
      expect(decrypted).toBe(plainText);
    });

    it('should produce different encrypted values for the same input', () => {
      const plainText = 'sensitive data';
      const encrypted1 = service.encrypt(plainText);
      const encrypted2 = service.encrypt(plainText);

      expect(encrypted1).not.toBe(encrypted2);
      expect(service.decrypt(encrypted1)).toBe(plainText);
      expect(service.decrypt(encrypted2)).toBe(plainText);
    });

    it('should handle special characters and unicode', () => {
      const plainText = 'Address with émojis 🏠 and spëcial chars: @#$%^&*()';
      const encrypted = service.encrypt(plainText);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plainText);
    });

    it('should throw error for invalid encrypted data format', () => {
      expect(() => service.decrypt('invalid-format')).toThrow('Failed to decrypt data');
      expect(() => service.decrypt('part1:part2')).toThrow('Failed to decrypt data');
      expect(() => service.decrypt('invalid:data:format:too:many:parts')).toThrow('Failed to decrypt data');
    });
  });

  describe('encryptFields and decryptFields', () => {
    it('should encrypt and decrypt specified fields in an object', () => {
      const user = {
        id: 1,
        email: 'user@example.com',
        address: '123 Main St',
        phone: '555-1234',
        name: 'John Doe',
      };

      const encryptedUser = service.encryptFields(user, ['address', 'phone']);
      
      expect(encryptedUser.email).toBe(user.email);
      expect(encryptedUser.name).toBe(user.name);
      expect(encryptedUser.address).not.toBe(user.address);
      expect(encryptedUser.phone).not.toBe(user.phone);
      expect(encryptedUser.address).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);

      const decryptedUser = service.decryptFields(encryptedUser, ['address', 'phone']);
      
      expect(decryptedUser.address).toBe(user.address);
      expect(decryptedUser.phone).toBe(user.phone);
      expect(decryptedUser.email).toBe(user.email);
      expect(decryptedUser.name).toBe(user.name);
    });

    it('should handle missing or non-string fields gracefully', () => {
      const obj = {
        id: 1,
        address: '123 Main St',
        phone: null,
        age: 25,
      };

      const encrypted = service.encryptFields(obj, ['address', 'phone', 'age'] as any);
      
      expect(encrypted.address).not.toBe(obj.address);
      expect(encrypted.phone).toBe(null);
      expect(encrypted.age).toBe(25);
    });
  });

  describe('error handling', () => {
    it('should throw error when ENCRYPTION_KEY is not provided', () => {
      expect(() => {
        const module = Test.createTestingModule({
          providers: [
            EncryptionService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn(() => null),
              },
            },
          ],
        });
        module.compile();
      }).toThrow();
    });
  });

  describe('generateKey', () => {
    it('should generate a valid base64 key', () => {
      const key = EncryptionService.generateKey();
      
      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
      
      // Should be valid base64
      expect(() => Buffer.from(key, 'base64')).not.toThrow();
    });

    it('should generate different keys each time', () => {
      const key1 = EncryptionService.generateKey();
      const key2 = EncryptionService.generateKey();
      
      expect(key1).not.toBe(key2);
    });
  });
});
