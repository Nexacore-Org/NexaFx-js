const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testIpWhitelist() {
  console.log('=== Testing IP Whitelist Module ===\n');

  try {
    // 1. Check current IP status
    console.log('1. Checking current IP status...');
    const checkResponse = await axios.get(`${BASE_URL}/ip-whitelist/check`);
    console.log('✅ Check IP Response:', checkResponse.data);
    console.log();

    // 2. Get all whitelisted IPs
    console.log('2. Getting all whitelisted IPs...');
    const allIpsResponse = await axios.get(`${BASE_URL}/ip-whitelist`);
    console.log('✅ All IPs Response:', allIpsResponse.data);
    console.log();

    // 3. Add new IP to whitelist
    console.log('3. Adding new IP to whitelist...');
    const newIpResponse = await axios.post(`${BASE_URL}/ip-whitelist`, {
      ipAddress: '192.168.1.100',
      description: 'Test IP for development',
      isActive: true
    });
    console.log('✅ New IP Added:', newIpResponse.data);
    console.log();

    // 4. Test admin route access
    console.log('4. Testing admin route access...');
    const adminResponse = await axios.get(`${BASE_URL}/admin/dashboard`);
    console.log('✅ Admin Access:', adminResponse.data);
    console.log();

    // 5. Get active IPs only
    console.log('5. Getting active IPs only...');
    const activeIpsResponse = await axios.get(`${BASE_URL}/ip-whitelist/active`);
    console.log('✅ Active IPs:', activeIpsResponse.data);

  } catch (error) {
    if (error.response) {
      console.log('❌ Error Response:', {
        status: error.response.status,
        message: error.response.data.message || error.response.data
      });
    } else {
      console.log('❌ Network Error:', error.message);
    }
  }
}

// Test with different IP (should fail)
async function testBlockedIp() {
  console.log('\n=== Testing Blocked IP Access ===\n');
  
  try {
    // This would normally fail if called from a non-whitelisted IP
    const response = await axios.get(`${BASE_URL}/admin/dashboard`, {
      headers: {
        'X-Forwarded-For': '203.0.113.1' // Example blocked IP
      }
    });
    console.log('⚠️ Unexpected success:', response.data);
  } catch (error) {
    if (error.response && error.response.status === 403) {
      console.log('✅ Access correctly blocked for non-whitelisted IP');
      console.log('Block message:', error.response.data.message);
    } else {
      console.log('❌ Unexpected error:', error.message);
    }
  }
}

// Run tests
testIpWhitelist()
  .then(() => testBlockedIp())
  .catch(console.error);