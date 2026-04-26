const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function run() {
  const token = 'YOUR_JWT_TOKEN';

  const headers = {
    Authorization: `Bearer ${token}`,
  };

  console.log('Fetching spending insights...');
  await axios.get(`${BASE_URL}/insights/spending`, { headers });

  console.log('Fetching category breakdown...');
  await axios.get(`${BASE_URL}/insights/categories`, { headers });

  console.log('Fetching trends...');
  await axios.get(`${BASE_URL}/insights/trends`, { headers });

  console.log('Triggering aggregation...');
  await axios.post(`${BASE_URL}/admin/analytics/aggregate`, {}, { headers });

  console.log('Fetching lineage...');
  await axios.get(`${BASE_URL}/admin/analytics/lineage`, { headers });

  console.log('All analytics endpoints OK ✅');
}

run().catch(console.error);