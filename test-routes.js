// Test script to check if admin-payments routes can be loaded
const path = require('path');

try {
    console.log('Testing admin-payments routes...');
    const adminPaymentsRoutes = require('./routes/admin-payments');
    console.log('✓ admin-payments routes loaded successfully');
    console.log('Routes object type:', typeof adminPaymentsRoutes);
} catch (error) {
    console.error('✗ Error loading admin-payments routes:', error);
    console.error('Stack:', error.stack);
}

// Test other route files to compare
try {
    const adminRoutes = require('./routes/admin');
    console.log('✓ admin routes loaded successfully');
} catch (error) {
    console.error('✗ Error loading admin routes:', error);
}

console.log('Test completed.');
