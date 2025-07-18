// Script to test admin payment API endpoints
const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Replace with actual admin credentials
const adminUser = {
  id: 1,
  username: 'admin',
  isAdmin: true
};

// Create JWT token for testing
const token = jwt.sign(
  adminUser,
  process.env.JWT_SECRET || 'supersecretkey',
  { expiresIn: '1h' }
);

// Configure axios
const api = axios.create({
  baseURL: 'https://coachreservation-0caad91c51ab.herokuapp.com/api',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

// Test endpoints
async function testPaymentEndpoints() {
  try {
    console.log('Testing payment endpoints...');
    
    // Test statistics endpoint
    console.log('1. Testing payment statistics endpoint...');
    const statsResponse = await api.get('/admin/payments/statistics');
    console.log('✓ Statistics endpoint successful');
    console.log(statsResponse.data);
    
    // Test get all payments endpoint
    console.log('\n2. Testing get all payments endpoint...');
    const paymentsResponse = await api.get('/admin/payments');
    console.log('✓ Get payments endpoint successful');
    console.log(`Found ${paymentsResponse.data.length} payment plans`);
    
    if (paymentsResponse.data.length > 0) {
      const paymentPlanId = paymentsResponse.data[0].payment_plan_id;
      
      // Test get installments endpoint
      console.log(`\n3. Testing get installments for payment plan ${paymentPlanId}...`);
      const installmentsResponse = await api.get(`/admin/payments/${paymentPlanId}/installments`);
      console.log('✓ Get installments endpoint successful');
      console.log(`Found ${installmentsResponse.data.length} installments`);
    }
    
    // Test overdue payments endpoint
    console.log('\n4. Testing overdue payments endpoint...');
    const overdueResponse = await api.get('/admin/payments/overdue');
    console.log('✓ Overdue payments endpoint successful');
    console.log(`Found ${overdueResponse.data.length} overdue payments`);
    
    console.log('\nAll payment API endpoints are working correctly!');
  } catch (error) {
    console.error('Error testing payment endpoints:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testPaymentEndpoints();
