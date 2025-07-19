// Test script to check if the admin payment endpoints are properly mounted
const axios = require('axios');
const jwt = require('jsonwebtoken');

// Mock admin user for testing
const mockAdminUser = {
  id: 1,
  username: 'admin',
  isAdmin: true
};

// Generate a test token
const token = jwt.sign(
  mockAdminUser,
  process.env.JWT_SECRET || 'supersecretkey',
  { expiresIn: '1h' }
);

// Test the endpoints
async function testEndpoints() {
  try {
    console.log('Testing API endpoints...');
    
    // Test health endpoint first (no auth required)
    console.log('\n1. Testing health endpoint...');
    try {
      const healthResponse = await axios.get('http://localhost:3000/api/health');
      console.log('✓ Health endpoint response:', healthResponse.data);
    } catch (error) {
      console.error('✗ Health endpoint error:', error.message);
    }
    
    // Set up axios with auth token
    const api = axios.create({
      baseURL: 'http://localhost:3000/api',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Test admin payments endpoint
    console.log('\n2. Testing admin payments endpoint...');
    try {
      const paymentsResponse = await api.get('/admin/payments');
      console.log('✓ Admin payments endpoint response:', 
                 `Found ${paymentsResponse.data.length} payment plans`);
    } catch (error) {
      console.error('✗ Admin payments endpoint error:', error.message);
      if (error.response) {
        console.error('  Status:', error.response.status);
        console.error('  Data:', error.response.data);
      }
    }
    
  } catch (error) {
    console.error('General error:', error.message);
  }
}

// Run the tests
testEndpoints();
