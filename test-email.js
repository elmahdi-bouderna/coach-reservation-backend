#!/usr/bin/env node
/**
 * Email Test Utility for Coach Reservation System
 * 
 * This script tests the email sending functionality by sending a test email
 * to verify your SMTP configuration is working correctly.
 * 
 * Usage:
 *   node test-email.js [test|production] [your-email@example.com]
 * 
 * Examples:
 *   node test-email.js                   - Uses settings from .env
 *   node test-email.js test              - Force test mode (Ethereal)
 *   node test-email.js production user@example.com - Force production mode and send to specified email
 */

// Load environment variables
require('dotenv').config();

// Import the email service
const emailService = require('./utils/emailService');

// Process command line arguments
const args = process.argv.slice(2);
let emailMode = process.env.EMAIL_MODE || 'test';
let testEmail = process.env.ADMIN_EMAIL || null;

// Override email mode if specified
if (args[0] && (args[0] === 'test' || args[0] === 'production')) {
  emailMode = args[0];
  console.log(`Overriding EMAIL_MODE to: ${emailMode}`);
  process.env.EMAIL_MODE = emailMode;
}

// Use provided test email if specified
if (args[1] && args[1].includes('@')) {
  testEmail = args[1];
  console.log(`Using provided test email: ${testEmail}`);
}

// Validate we have a test email
if (!testEmail) {
  console.error('Error: No test email address available. Please provide one as an argument or set ADMIN_EMAIL in .env');
  process.exit(1);
}

async function runTest() {
  console.log('='.repeat(60));
  console.log('Coach Reservation System - Email Test Utility');
  console.log('='.repeat(60));
  console.log(`Mode: ${emailMode.toUpperCase()}`);
  console.log(`Test recipient: ${testEmail}`);
  console.log(`Email configuration:`);
  console.log(`- Host: ${process.env.EMAIL_HOST}`);
  console.log(`- Port: ${process.env.EMAIL_PORT}`);
  console.log(`- User: ${process.env.EMAIL_USER}`);
  console.log(`- Secure: ${process.env.EMAIL_SECURE}`);
  console.log('='.repeat(60));
  
  console.log('\nSending test confirmation email...');
  
  try {
    // Test the confirmation email
    const confirmationResult = await emailService.sendReservationConfirmation({
      recipientEmail: testEmail,
      recipientName: 'Test User',
      coachName: 'Test Coach',
      date: new Date().toISOString(),
      time: '14:00:00',
      points: 70
    });
    
    console.log(`Confirmation email result: ${confirmationResult ? 'SUCCESS ✓' : 'FAILED ✗'}`);
    
    // Test the admin notification
    console.log('\nSending test admin notification...');
    const notificationResult = await emailService.sendAdminNotification({
      clientName: 'Test Client',
      clientEmail: 'test@example.com',
      coachName: 'Test Coach',
      date: new Date().toISOString(),
      time: '14:00:00'
    });
    
    console.log(`Admin notification result: ${notificationResult ? 'SUCCESS ✓' : 'FAILED ✗'}`);
    
    if (emailMode === 'test') {
      console.log('\nNote: In TEST mode, emails are not actually delivered.');
      console.log('Check the console output above for Ethereal preview URLs to view the test emails.');
    } else {
      console.log('\nNote: In PRODUCTION mode, actual emails have been sent.');
      console.log(`Please check the inbox for ${testEmail} to verify receipt.`);
    }
    
    console.log('\nEmail test completed.');
  } catch (error) {
    console.error('Error during email test:', error);
    process.exit(1);
  }
}

// Run the test
runTest();
