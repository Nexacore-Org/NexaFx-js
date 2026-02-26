import { Test, TestingModule } from '@nestjs/testing';
import { UsersV1Controller } from '../../src/versioning/controllers/users-v1.controller';
import { UsersV2Controller } from '../../src/versioning/controllers/users-v2.controller';
import { VersioningService } from '../../src/versioning/services/versioning.service';

describe('UsersV1Controller', () => {
  let controller: UsersV1Controller;
  let versioningService: VersioningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersV1Controller],
      providers: [VersioningService],
    }).compile();

    controller = module.get<UsersV1Controller>(UsersV1Controller);
    versioningService = module.get<VersioningService>(VersioningService);
  });

  describe('findAll()', () => {
    it('should return an array of users', () => {
      const result = controller.findAll();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return users with flat name field (V1 format)', () => {
      const result = controller.findAll();
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('email');
      expect(result[0]).not.toHaveProperty('firstName');
    });
  });

  describe('getVersion()', () => {
    it('should return version info with deprecated flag', () => {
      const result = controller.getVersion();
      expect(result.version).toBe('1');
      expect(result.deprecated).toBe(true);
    });

    it('should include API summary', () => {
      const result = controller.getVersion();
      expect(result).toHaveProperty('currentVersion');
      expect(result).toHaveProperty('supportedVersions');
    });
  });
});

describe('UsersV2Controller', () => {
  let controller: UsersV2Controller;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersV2Controller],
      providers: [VersioningService],
    }).compile();

    controller = module.get<UsersV2Controller>(UsersV2Controller);
  });

  describe('findAll()', () => {
    it('should return paginated wrapper with data and meta', () => {
      const result = controller.findAll();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
    });

    it('should return users with firstName/lastName (V2 format)', () => {
      const result = controller.findAll();
      const user = result.data[0];
      expect(user).toHaveProperty('firstName');
      expect(user).toHaveProperty('lastName');
      expect(user).toHaveProperty('createdAt');
      expect(user).not.toHaveProperty('name');
    });
  });

  describe('findOne()', () => {
    it('should return a single user with the provided id', () => {
      const result = controller.findOne('42');
      expect(result.id).toBe('42');
      expect(result).toHaveProperty('firstName');
    });
  });

  describe('getVersion()', () => {
    it('should return API version summary', () => {
      const result = controller.getVersion();
      expect(result).toHaveProperty('currentVersion', '2');
    });
  });
});
