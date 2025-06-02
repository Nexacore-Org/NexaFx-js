const axios = require('axios');

async function testRateLimit() {
  const baseURL = 'http://localhost:3000';
  const loginEndpoint = `${baseURL}/auth/login`;
  
  console.log('Testing rate limiting on /auth/login endpoint...\n');
  
  for (let i = 1; i <= 10; i++) {
    try {
      const response = await axios.post(loginEndpoint, {
        email: 'test@example.com',
        password: 'password123'
      });
      
      console.log(`Request ${i}: SUCCESS - ${response.status}`);
    } catch (error) {
      if (error.response) {
        console.log(`Request ${i}: ERROR - ${error.response.status} - ${error.response.data.message}`);
        
        if (error.response.status === 429) {
          console.log(`Rate limit triggered! Retry after: ${error.response.data.retryAfter} seconds\n`);
          break;
        }
      } else {
        console.log(`Request ${i}: NETWORK ERROR - ${error.message}`);
      }
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

testRateLimit().catch(console.error);