#!/usr/bin/env node

/**
 * Test script for wallet alias functionality
 * Run with: node test-wallet-aliases.js
 */

const BASE_URL = 'http://localhost:3000';

// Mock JWT token for testing (replace with actual token)
const AUTH_TOKEN = 'Bearer your-jwt-token-here';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': AUTH_TOKEN,
};

async function testWalletAliases() {
  console.log('🧪 Testing Wallet Alias Functionality\n');

  try {
    // Test 1: Create a wallet alias
    console.log('1. Creating wallet alias...');
    const createResponse = await fetch(`${BASE_URL}/wallet-aliases`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        alias: 'My Savings Wallet',
        metadata: {
          type: 'savings',
          description: 'Main savings account'
        }
      })
    });

    if (createResponse.ok) {
      const createResult = await createResponse.json();
      console.log('✅ Created:', createResult.data.alias);
      console.log('   ID:', createResult.data.id);
    } else {
      console.log('❌ Create failed:', await createResponse.text());
    }

    // Test 2: List all wallet aliases
    console.log('\n2. Listing wallet aliases...');
    const listResponse = await fetch(`${BASE_URL}/wallet-aliases`, {
      method: 'GET',
      headers,
    });

    if (listResponse.ok) {
      const listResult = await listResponse.json();
      console.log('✅ Found', listResult.data.length, 'aliases:');
      listResult.data.forEach(alias => {
        console.log(`   - ${alias.alias} (${alias.walletAddress})`);
      });
    } else {
      console.log('❌ List failed:', await listResponse.text());
    }

    // Test 3: Create another alias
    console.log('\n3. Creating second wallet alias...');
    const createResponse2 = await fetch(`${BASE_URL}/wallet-aliases`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        alias: 'Business Wallet',
        metadata: {
          type: 'business',
          description: 'Company operations wallet'
        }
      })
    });

    if (createResponse2.ok) {
      const createResult2 = await createResponse2.json();
      console.log('✅ Created:', createResult2.data.alias);
    } else {
      console.log('❌ Create failed:', await createResponse2.text());
    }

    // Test 4: Test transaction search with aliases
    console.log('\n4. Testing transaction search with wallet aliases...');
    const searchResponse = await fetch(`${BASE_URL}/transactions/search?limit=5`, {
      method: 'GET',
      headers,
    });

    if (searchResponse.ok) {
      const searchResult = await searchResponse.json();
      console.log('✅ Transaction search successful');
      console.log('   Found', searchResult.data.length, 'transactions');
      
      // Check if any transactions have wallet aliases
      const transactionsWithAliases = searchResult.data.filter(tx => tx.walletAliases);
      if (transactionsWithAliases.length > 0) {
        console.log('   Transactions with aliases:', transactionsWithAliases.length);
      } else {
        console.log('   No transactions with wallet aliases found');
      }
    } else {
      console.log('❌ Transaction search failed:', await searchResponse.text());
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Instructions for running the test
console.log('📋 Wallet Alias Test Instructions:');
console.log('1. Start your NestJS server: npm run start:dev');
console.log('2. Update AUTH_TOKEN in this script with a valid JWT');
console.log('3. Run: node test-wallet-aliases.js\n');

// Uncomment the line below to run the test
// testWalletAliases();