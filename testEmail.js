// Test script for email functionality
const emailService = require('./utils/emailService');

async function testEmail() {
  console.log('Starting email test...');
  
  // Test the confirmation email
  const confirmationResult = await emailService.sendReservationConfirmation({
    recipientEmail: process.env.ADMIN_EMAIL, // Send to yourself for testing
    recipientName: 'Test User',
    coachName: 'Test Coach',
    date: new Date().toISOString(),
    time: '14:00:00',
    points: 70
  });
  
  console.log('Confirmation email test result:', confirmationResult);
  
  // Test the admin notification
  const notificationResult = await emailService.sendAdminNotification({
    clientName: 'Test Client',
    clientEmail: 'test@example.com',
    coachName: 'Test Coach',
    date: new Date().toISOString(),
    time: '14:00:00'
  });
  
  console.log('Admin notification test result:', notificationResult);
  
  console.log('Email tests completed');
}

// Load environment variables
require('dotenv').config();

// Run the test
testEmail()
  .then(() => console.log('Test script finished'))
  .catch(err => console.error('Test script failed:', err));
