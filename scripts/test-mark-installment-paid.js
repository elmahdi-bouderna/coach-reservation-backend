const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const config = {
  host: 'mysql-swibi.alwaysdata.net',
  user: 'swibi',
  password: 'BK734713@Mehdi',
  database: 'swibi_coaching_system'
};

async function testMarkInstallmentPaid() {
  let connection;
  
  try {
    connection = await mysql.createConnection(config);
    console.log('✅ Connected to database');

    // First, get an actual installment to test with
    const [installments] = await connection.execute(`
      SELECT pi.*, pp.user_pack_id 
      FROM payment_installments pi 
      JOIN payment_plans pp ON pi.payment_plan_id = pp.id 
      WHERE pi.status = 'pending' 
      LIMIT 1
    `);

    if (installments.length === 0) {
      console.log('❌ No pending installments found to test with');
      return;
    }

    const installment = installments[0];
    console.log('📋 Testing with installment:', {
      id: installment.id,
      amount: installment.amount,
      payment_method: installment.payment_method,
      status: installment.status
    });

    // Test the MarkInstallmentPaid stored procedure
    console.log('\n🔧 Testing MarkInstallmentPaid procedure...');
    
    const testParams = [
      installment.id,                           // p_installment_id
      '2025-07-07',                            // p_payment_date
      installment.payment_method,               // p_payment_method
      installment.payment_method === 'virement' ? '123456789012345678901234' : null, // p_rib
      installment.payment_method === 'virement' ? 'TEST_REF_001' : null,              // p_bank_reference
      installment.payment_method === 'cash' ? 'RECEIPT_001' : null,                   // p_receipt_number
      'Test payment via script',                // p_notes
      1                                        // p_processed_by (admin user ID)
    ];

    console.log('Parameters:', testParams);

    // Execute the stored procedure
    await connection.execute(`
      CALL MarkInstallmentPaid(?, ?, ?, ?, ?, ?, ?, ?)
    `, testParams);

    console.log('✅ MarkInstallmentPaid procedure executed successfully');

    // Verify the update
    const [updatedInstallment] = await connection.execute(`
      SELECT * FROM payment_installments WHERE id = ?
    `, [installment.id]);

    console.log('📊 Updated installment:', {
      id: updatedInstallment[0].id,
      status: updatedInstallment[0].status,
      payment_date: updatedInstallment[0].payment_date,
      payment_method: updatedInstallment[0].payment_method,
      rib: updatedInstallment[0].rib,
      bank_reference: updatedInstallment[0].bank_reference,
      receipt_number: updatedInstallment[0].receipt_number
    });

    // Check payment history
    const [history] = await connection.execute(`
      SELECT * FROM payment_history 
      WHERE installment_id = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `, [installment.id]);

    if (history.length > 0) {
      console.log('📝 Payment history entry created:', {
        action: history[0].action,
        amount: history[0].amount,
        new_value: history[0].new_value
      });
    }

  } catch (error) {
    console.error('❌ Error during test:', error.message);
    console.error('Full error:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔐 Database connection closed');
    }
  }
}

testMarkInstallmentPaid();
