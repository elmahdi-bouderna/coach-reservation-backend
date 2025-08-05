const mysql = require('mysql2/promise');

const config = {
  host: 'mysql-swibi.alwaysdata.net',
  user: 'swibi',
  password: 'BK734713@Mehdi',
  database: 'swibi_coaching'
};

async function checkPaymentSystem() {
  let connection;
  
  try {
    connection = await mysql.createConnection(config);
    console.log('✅ Connected to database');

    // Check if payment tables exist
    console.log('\n📋 Checking payment tables...');
    
    const tables = ['payment_plans', 'payment_installments', 'payment_reminders', 'payment_history'];
    
    for (const table of tables) {
      try {
        const [result] = await connection.execute(`SHOW TABLES LIKE '${table}'`);
        if (result.length > 0) {
          console.log(`✅ Table '${table}' exists`);
          
          // Get table structure
          const [structure] = await connection.execute(`DESCRIBE ${table}`);
          console.log(`   Columns: ${structure.map(col => col.Field).join(', ')}`);
        } else {
          console.log(`❌ Table '${table}' does NOT exist`);
        }
      } catch (error) {
        console.log(`❌ Error checking table '${table}':`, error.message);
      }
    }

    // Check if stored procedures exist
    console.log('\n🔧 Checking stored procedures...');
    
    const procedures = ['CreatePaymentPlan', 'MarkInstallmentPaid', 'UpdateOverduePayments'];
    
    for (const procedure of procedures) {
      try {
        const [result] = await connection.execute(`
          SELECT ROUTINE_NAME 
          FROM INFORMATION_SCHEMA.ROUTINES 
          WHERE ROUTINE_SCHEMA = 'swibi_coaching' 
          AND ROUTINE_NAME = ?
        `, [procedure]);
        
        if (result.length > 0) {
          console.log(`✅ Stored procedure '${procedure}' exists`);
        } else {
          console.log(`❌ Stored procedure '${procedure}' does NOT exist`);
        }
      } catch (error) {
        console.log(`❌ Error checking procedure '${procedure}':`, error.message);
      }
    }

    // Check if there are any payment records
    try {
      const [paymentPlans] = await connection.execute('SELECT COUNT(*) as count FROM payment_plans');
      const [installments] = await connection.execute('SELECT COUNT(*) as count FROM payment_installments');
      
      console.log(`\n📊 Payment Records:`);
      console.log(`   Payment Plans: ${paymentPlans[0].count}`);
      console.log(`   Installments: ${installments[0].count}`);
    } catch (error) {
      console.log('❌ Error checking payment records:', error.message);
    }

  } catch (error) {
    console.error('❌ Database connection error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔐 Database connection closed');
    }
  }
}

checkPaymentSystem();
