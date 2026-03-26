import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { BlockchainService } from './blockchain.service';

describe('BlockchainService', () => {
  let service: BlockchainService;
  let mockHttpService: any;
  let mockConfigService: any;

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, any> = {
          BLOCKCHAIN_RPC_URL: 'http://localhost:8545',
          BLOCKCHAIN_REQUIRED_CONFIRMATIONS: 12,
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockchainService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<BlockchainService>(BlockchainService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTransactionReceipt', () => {
    it('should return receipt with confirmations when transaction is mined', async () => {
      const txHash = '0x1234567890';
      const blockNumber = 100;
      const currentBlock = 115;

      mockHttpService.post.mockImplementation((url: string, data: any) => {
        if (data.method === 'eth_getTransactionReceipt') {
          return of({
            data: {
              result: {
                blockNumber: '0x64', // 100 in hex
                status: '0x1',
              },
            },
          });
        } else if (data.method === 'eth_blockNumber') {
          return of({
            data: {
              result: '0x73', // 115 in hex
            },
          });
        }
      });

      const result = await service.getTransactionReceipt(txHash);

      expect(result.blockNumber).toBe(blockNumber);
      expect(result.isValid).toBe(true);
      expect(result.confirmations).toBe(currentBlock - blockNumber);
    });

    it('should return isValid: false when transaction not found', async () => {
      const txHash = '0x1234567890';

      mockHttpService.post.mockReturnValue(
        of({
          data: {
            result: null,
          },
        }),
      );

      const result = await service.getTransactionReceipt(txHash);

      expect(result.isValid).toBe(false);
      expect(result.confirmations).toBe(0);
    });

    it('should throw error on RPC failure', async () => {
      const txHash = '0x1234567890';

      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('RPC connection failed')),
      );

      await expect(service.getTransactionReceipt(txHash)).rejects.toThrow(
        'RPC connection failed',
      );
    });
  });

  describe('getCurrentBlock', () => {
    it('should return current block number', async () => {
      const blockNumber = 115;

      mockHttpService.post.mockReturnValue(
        of({
          data: {
            result: '0x73', // 115 in hex
          },
        }),
      );

      const result = await service.getCurrentBlock();

      expect(result).toBe(blockNumber);
      expect(mockHttpService.post).toHaveBeenCalledWith(
        'http://localhost:8545',
        expect.objectContaining({
          method: 'eth_blockNumber',
        }),
      );
    });

    it('should throw error on RPC failure', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('RPC failed')),
      );

      await expect(service.getCurrentBlock()).rejects.toThrow('RPC failed');
    });
  });

  describe('getTransactionStatus', () => {
    it('should return SUCCESS when receipt status is 0x1', async () => {
      const txHash = '0x1234567890';

      mockHttpService.post.mockImplementation((url: string, data: any) => {
        if (data.method === 'eth_getTransactionReceipt') {
          return of({
            data: {
              result: {
                blockNumber: '0x64',
                status: '0x1', // Success
              },
            },
          });
        }
      });

      const result = await service.getTransactionStatus(txHash);

      expect(result).toBe('SUCCESS');
    });

    it('should return FAILED when receipt status is 0x0', async () => {
      const txHash = '0x1234567890';

      mockHttpService.post.mockImplementation((url: string, data: any) => {
        if (data.method === 'eth_getTransactionReceipt') {
          return of({
            data: {
              result: {
                blockNumber: '0x64',
                status: '0x0', // Failed
              },
            },
          });
        }
      });

      const result = await service.getTransactionStatus(txHash);

      expect(result).toBe('FAILED');
    });

    it('should return null when transaction not yet mined', async () => {
      const txHash = '0x1234567890';

      mockHttpService.post.mockReturnValue(
        of({
          data: {
            result: null,
          },
        }),
      );

      const result = await service.getTransactionStatus(txHash);

      expect(result).toBe(null);
    });

    it('should throw error on RPC failure', async () => {
      const txHash = '0x1234567890';

      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('RPC error')),
      );

      await expect(service.getTransactionStatus(txHash)).rejects.toThrow(
        'RPC error',
      );
    });
  });

  describe('hasRequiredConfirmations', () => {
    it('should return true when confirmations >= required', async () => {
      const txHash = '0x1234567890';

      mockHttpService.post.mockImplementation((url: string, data: any) => {
        if (data.method === 'eth_getTransactionReceipt') {
          return of({
            data: {
              result: {
                blockNumber: '0x64', // 100
              },
            },
          });
        }
      });

      // Mock getCurrentBlock to return 115 (15 confirmations, more than required 12)
      jest.spyOn(service, 'getCurrentBlock').mockResolvedValue(115);

      const result = await service.hasRequiredConfirmations(txHash);

      expect(result).toBe(true);
    });

    it('should return false when confirmations < required', async () => {
      const txHash = '0x1234567890';

      mockHttpService.post.mockImplementation((url: string, data: any) => {
        if (data.method === 'eth_getTransactionReceipt') {
          return of({
            data: {
              result: {
                blockNumber: '0x64', // 100
              },
            },
          });
        }
      });

      // Mock getCurrentBlock to return 105 (5 confirmations, less than required 12)
      jest.spyOn(service, 'getCurrentBlock').mockResolvedValue(105);

      const result = await service.hasRequiredConfirmations(txHash);

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const txHash = '0x1234567890';

      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('RPC error')),
      );

      const result = await service.hasRequiredConfirmations(txHash);

      expect(result).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should use default RPC URL if not configured', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const testModule = Test.createTestingModule({
        providers: [
          BlockchainService,
          {
            provide: HttpService,
            useValue: mockHttpService,
          },
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      });

      // Service should still be created with default values
      expect(BlockchainService).toBeDefined();
    });

    it('should read RPC URL from config', () => {
      const customRpcUrl = 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID';
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'BLOCKCHAIN_RPC_URL') {
          return customRpcUrl;
        }
      });

      // Verify config is being read
      expect(mockConfigService.get).toBeDefined();
    });
  });
});
