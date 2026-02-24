import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { getConnection } from 'typeorm';
import { UserEntity } from '../src/modules/users/entities/user.entity';
import { WalletEntity } from '../src/modules/users/entities/wallet.entity';
import { UsersModule } from '../src/modules/users/users.module';
import { WalletService } from '../src/modules/users/wallet.service';

describe('Wallet Uniqueness Integration Tests', () => {
  let app: INestApplication;
  let walletService: WalletService;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          username: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          database: process.env.DB_NAME || 'test_db',
          entities: [UserEntity, WalletEntity],
          synchronize: true, // For testing purposes
        }),
        UsersModule,
      ],
      providers: [WalletService],
    }).compile();

    app = moduleFixture.createNestApplication();
    walletService = moduleFixture.get<WalletService>(WalletService);

    await app.init();

    // Create a test user
    const userRepository = moduleFixture.get('UserEntityRepository');
    const testUser = await userRepository.save({
      email: `test-${Date.now()}@example.com`,
      firstName: 'Test',
      lastName: 'User',
      status: 'active',
    });
    userId = testUser.id;
  });

  afterAll(async () => {
    // Clean up test data
    const entityManager = getConnection().manager;
    await entityManager.query('DELETE FROM wallets WHERE userId = $1', [userId]);
    await entityManager.query('DELETE FROM users WHERE id = $1', [userId]);
    
    await app.close();
  });

  it('should prevent creating two wallets with the same public key', async () => {
    const publicKey = '0x1234567890123456789012345678901234567890';
    
    // Create first wallet
    const firstWallet = await walletService.createWallet(userId, {
      publicKey,
      name: 'First Wallet',
      type: 'crypto',
    });
    
    expect(firstWallet).toBeDefined();
    expect(firstWallet.publicKey).toBe(publicKey);

    // Attempt to create second wallet with same public key should throw an error
    await expect(
      walletService.createWallet(userId, {
        publicKey,
        name: 'Second Wallet',
        type: 'crypto',
      })
    ).rejects.toThrow('Wallet with this public key already exists');

    // Verify only one wallet exists with this public key
    const wallets = await walletService.getWalletsByUser(userId);
    expect(wallets.length).toBe(1);
    expect(wallets[0].publicKey).toBe(publicKey);
  });

  it('should prevent updating a wallet to a public key that already exists', async () => {
    // Create two wallets with different public keys
    const wallet1 = await walletService.createWallet(userId, {
      publicKey: '0x1111111111111111111111111111111111111111',
      name: 'Wallet 1',
      type: 'crypto',
    });

    const wallet2 = await walletService.createWallet(userId, {
      publicKey: '0x2222222222222222222222222222222222222222',
      name: 'Wallet 2',
      type: 'crypto',
    });

    expect(wallet1).toBeDefined();
    expect(wallet2).toBeDefined();
    expect(wallet1.publicKey).not.toBe(wallet2.publicKey);

    // Attempt to update wallet2 to use wallet1's public key should throw an error
    await expect(
      walletService.updateWallet(wallet2.id, {
        publicKey: wallet1.publicKey, // Same as wallet1
        name: 'Updated Wallet 2',
      })
    ).rejects.toThrow('Another wallet with this public key already exists');

    // Verify wallet public keys remain unchanged
    const updatedWallet1 = await walletService.getWalletById(wallet1.id);
    const updatedWallet2 = await walletService.getWalletById(wallet2.id);
    
    expect(updatedWallet1.publicKey).toBe(wallet1.publicKey);
    expect(updatedWallet2.publicKey).toBe(wallet2.publicKey);
  });
});