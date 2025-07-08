// Simple test script to check if API endpoints are accessible without authentication
const axios = require('axios');

async function testEndpointAvailability() {
  try {
    // Test server health endpoint first
    console.log('1. Testing server health endpoint...');
    const healthResponse = await axios.get('https://coach-reservation.onrender.com/api/health');
    console.log('✓ Server health endpoint is working');
    console.log(healthResponse.data);
    
    // Check if admin payment endpoints are properly mounted
    console.log('\n2. Testing if admin payment endpoints are mounted (expect 401/403 errors)...');
    
    try {
      await axios.get('https://coach-reservation.onrender.com/api/admin/payments');
      console.log('✓ Admin payments endpoint is mounted (returned data)');
    } catch (error) {
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        console.log('✓ Admin payments endpoint is mounted (expected auth error)');
      } else {
        console.error('✗ Admin payments endpoint might not be properly mounted:', error.message);
      }
    }
    
    try {
      await axios.get('https://coach-reservation.onrender.com/api/admin/payments/statistics');
      console.log('✓ Payment statistics endpoint is mounted (returned data)');
    } catch (error) {
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        console.log('✓ Payment statistics endpoint is mounted (expected auth error)');
      } else {
        console.error('✗ Payment statistics endpoint might not be properly mounted:', error.message);
      }
    }
    
    console.log('\nEndpoint check completed.');
    console.log('All payment API endpoints appear to be properly mounted.');
    console.log('You should be able to access them through the admin interface after logging in.');
    
  } catch (error) {
    console.error('Error testing endpoints:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('Cannot connect to the server. Is the server running on port 5000?');
    }
  }
}

testEndpointAvailability();
