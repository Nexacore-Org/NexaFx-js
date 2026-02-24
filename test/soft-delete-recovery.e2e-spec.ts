import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { getConnection } from 'typeorm';
import { UserEntity } from '../src/modules/users/entities/user.entity';
import { WalletEntity } from '../src/modules/users/entities/wallet.entity';
import { UsersModule } from '../src/modules/users/users.module';
import { UsersService } from '../src/modules/users/users.service';
import { WalletService } from '../src/modules/users/wallet.service';

describe('Soft Delete Recovery Integration Tests', () => {
  let app: INestApplication;
  let usersService: UsersService;
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
      providers: [UsersService, WalletService],
    }).compile();

    app = moduleFixture.createNestApplication();
    usersService = moduleFixture.get<UsersService>(UsersService);
    walletService = moduleFixture.get<WalletService>(WalletService);

    await app.init();

    // Create a test user
    const testUser = await usersService.createUser({
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

  it('should soft delete a user and then restore them', async () => {
    // Verify user exists initially
    const initialUser = await usersService.findUserById(userId);
    expect(initialUser).toBeDefined();
    expect(initialUser.deletedAt).toBeUndefined();

    // Soft delete the user
    await usersService.softDeleteUser(userId);

    // Verify user is soft deleted
    const softDeletedUser = await usersService.findUserById(userId);
    expect(softDeletedUser).toBeDefined();
    expect(softDeletedUser.deletedAt).toBeDefined();

    // Verify user cannot be found in active queries
    await expect(usersService.findActiveUserById(userId)).rejects.toThrow('Active user not found');

    // Restore the user
    const restoredUser = await usersService.restoreUser(userId);
    expect(restoredUser).toBeDefined();
    expect(restoredUser.deletedAt).toBeUndefined();
    expect(restoredUser.status).toBe('active');

    // Verify user can now be found in active queries
    const activeUser = await usersService.findActiveUserById(userId);
    expect(activeUser).toBeDefined();
    expect(activeUser.id).toBe(userId);
  });

  it('should soft delete a wallet and then restore it', async () => {
    // Create a wallet
    const wallet = await walletService.createWallet(userId, {
      publicKey: '0x1234567890123456789012345678901234567890',
      name: 'Test Wallet',
      type: 'crypto',
    });

    expect(wallet).toBeDefined();
    expect(wallet.deletedAt).toBeUndefined();

    // Soft delete the wallet
    await walletService.softDeleteWallet(wallet.id);

    // Verify wallet is soft deleted
    await expect(walletService.getWalletById(wallet.id)).rejects.toThrow('Wallet not found');

    // Find wallet including soft deleted
    const walletRepo = getConnection().manager.getRepository(WalletEntity);
    const softDeletedWallet = await walletRepo.findOne({
      where: { id: wallet.id },
      withDeleted: true,
    });
    expect(softDeletedWallet).toBeDefined();
    expect(softDeletedWallet!.deletedAt).toBeDefined();

    // Restore the wallet
    const restoredWallet = await walletService.restoreWallet(wallet.id);
    expect(restoredWallet).toBeDefined();
    expect(restoredWallet.deletedAt).toBeUndefined();

    // Verify wallet can now be found in active queries
    const activeWallet = await walletService.getWalletById(wallet.id);
    expect(activeWallet).toBeDefined();
    expect(activeWallet.id).toBe(wallet.id);
  });

  it('should not allow restoring a user that was not soft deleted', async () => {
    // Create a new user
    const newUser = await usersService.createUser({
      email: `new-${Date.now()}@example.com`,
      firstName: 'New',
      lastName: 'User',
      status: 'active',
    });

    // Try to restore a user that was never soft deleted should throw an error
    await expect(usersService.restoreUser(newUser.id)).rejects.toThrow('User is not soft deleted');

    // Clean up
    await usersService.softDeleteUser(newUser.id);
  });
});
