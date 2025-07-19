const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyAdmin } = require('./auth');

// Get all payment plans with client information
router.get('/admin/payments', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const [payments] = await db.execute(`
            SELECT 
                pp.id as payment_plan_id,
                pp.user_pack_id,
                pp.total_amount,
                pp.number_of_installments,
                pp.installment_amount,
                pp.payment_type,
                pp.created_at as plan_created_at,
                pp.notes as plan_notes,
                u.id as user_id,
                u.full_name as client_name,
                u.email as client_email,
                u.phone as client_phone,
                u.matricule as client_matricule,
                p.name as pack_name,
                p.price as pack_price,
                COUNT(pi.id) as total_installments,
                SUM(CASE WHEN pi.status = 'paid' THEN pi.amount ELSE 0 END) as amount_paid,
                SUM(CASE WHEN pi.status = 'pending' THEN pi.amount ELSE 0 END) as amount_pending,
                SUM(CASE WHEN pi.status = 'overdue' THEN pi.amount ELSE 0 END) as amount_overdue,
                MIN(CASE WHEN pi.status IN ('pending', 'overdue') THEN pi.due_date END) as next_due_date,
                MAX(CASE WHEN pi.status = 'paid' THEN pi.payment_date END) as last_payment_date
            FROM payment_plans pp
            JOIN user_packs up ON pp.user_pack_id = up.id
            JOIN users u ON up.user_id = u.id
            JOIN packs p ON up.pack_id = p.id
            LEFT JOIN payment_installments pi ON pp.id = pi.payment_plan_id
            GROUP BY pp.id, pp.user_pack_id, pp.total_amount, pp.number_of_installments, 
                     pp.installment_amount, pp.payment_type, pp.created_at, pp.notes,
                     u.id, u.full_name, u.email, u.phone, u.matricule, p.name, p.price
            ORDER BY pp.created_at DESC
        `);
        
        res.json(payments);
    } catch (error) {
        console.error('Error fetching payment plans:', error);
        res.status(500).json({ error: 'Failed to fetch payment plans' });
    }
});

// Get payment installments for a specific payment plan
router.get('/admin/payments/:paymentPlanId/installments', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { paymentPlanId } = req.params;
        
        const [installments] = await db.execute(`
            SELECT 
                pi.*,
                u.username as processed_by_name
            FROM payment_installments pi
            LEFT JOIN users u ON pi.processed_by = u.id
            WHERE pi.payment_plan_id = ?
            ORDER BY pi.installment_number ASC
        `, [paymentPlanId]);
        
        res.json(installments);
    } catch (error) {
        console.error('Error fetching payment installments:', error);
        res.status(500).json({ error: 'Failed to fetch payment installments' });
    }
});

// Create a new payment plan
router.post('/admin/payments', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { 
            user_pack_id, 
            total_amount, 
            number_of_installments, 
            payment_type, 
            first_due_date, 
            notes 
        } = req.body;
        
        const created_by = req.user.id;
        
        // Call the stored procedure to create payment plan
        const [result] = await db.execute(`
            CALL CreatePaymentPlan(?, ?, ?, ?, ?, ?, ?)
        `, [
            user_pack_id,
            total_amount,
            number_of_installments,
            payment_type,
            first_due_date,
            created_by,
            notes
        ]);
        
        res.json({ 
            success: true, 
            message: 'Payment plan created successfully',
            payment_plan_id: result[0][0].payment_plan_id
        });
    } catch (error) {
        console.error('Error creating payment plan:', error);
        res.status(500).json({ error: 'Failed to create payment plan' });
    }
});

// Mark an installment as paid
router.put('/admin/payments/installments/:installmentId/paid', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { installmentId } = req.params;
        const { 
            payment_date, 
            payment_method, 
            rib, 
            bank_reference, 
            receipt_number, 
            notes 
        } = req.body;
        
        const processed_by = req.user.id;
        
        // Call the stored procedure to mark installment as paid
        await db.execute(`
            CALL MarkInstallmentPaid(?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            installmentId,
            payment_date,
            payment_method,
            rib,
            bank_reference,
            receipt_number,
            notes,
            processed_by
        ]);
        
        res.json({ 
            success: true, 
            message: 'Payment recorded successfully' 
        });
    } catch (error) {
        console.error('Error marking installment as paid:', error);
        res.status(500).json({ error: 'Failed to record payment' });
    }
});

// Mark an installment as unpaid (removes payment record)
router.put('/admin/payments/installments/:installmentId/unpaid', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { installmentId } = req.params;
        const processed_by = req.user.id;
        
        await db.execute(`
            UPDATE payment_installments 
            SET status = 'pending', 
                payment_date = NULL,
                bank_reference = NULL,
                receipt_number = NULL,
                processed_by = ?
            WHERE id = ?
        `, [processed_by, installmentId]);
        
        res.json({ 
            success: true, 
            message: 'Installment marked as unpaid successfully' 
        });
    } catch (error) {
        console.error('Error marking installment as unpaid:', error);
        res.status(500).json({ error: 'Failed to mark installment as unpaid' });
    }
});

// Enhanced update installment details endpoint
router.put('/admin/payments/installments/:installmentId', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { installmentId } = req.params;
        const { 
            amount, 
            due_date, 
            payment_method, 
            rib, 
            notes,
            status,
            payment_date,
            bank_reference,
            receipt_number
        } = req.body;
        
        const processed_by = req.user.id;
        
        // Build the update query dynamically based on provided fields
        let updateFields = [];
        let updateValues = [];
        
        if (amount !== undefined) {
            updateFields.push('amount = ?');
            updateValues.push(amount);
        }
        
        if (due_date !== undefined) {
            updateFields.push('due_date = ?');
            updateValues.push(due_date);
        }
        
        if (payment_method !== undefined) {
            updateFields.push('payment_method = ?');
            updateValues.push(payment_method);
            
            // Clear RIB and bank_reference if payment method is cash
            if (payment_method === 'cash') {
                updateFields.push('rib = NULL', 'bank_reference = NULL');
            }
        }
        
        if (rib !== undefined) {
            updateFields.push('rib = ?');
            updateValues.push(rib || null);
        }
        
        if (notes !== undefined) {
            updateFields.push('notes = ?');
            updateValues.push(notes);
        }
        
        if (status !== undefined) {
            updateFields.push('status = ?');
            updateValues.push(status);
        }
        
        if (payment_date !== undefined) {
            updateFields.push('payment_date = ?');
            updateValues.push(payment_date || null);
        }
        
        if (bank_reference !== undefined) {
            updateFields.push('bank_reference = ?');
            updateValues.push(bank_reference || null);
        }
        
        if (receipt_number !== undefined) {
            updateFields.push('receipt_number = ?');
            updateValues.push(receipt_number || null);
        }
        
        updateFields.push('processed_by = ?', 'updated_at = CURRENT_TIMESTAMP');
        updateValues.push(processed_by);
        
        // Add the installment ID at the end
        updateValues.push(installmentId);
        
        await db.execute(`
            UPDATE payment_installments 
            SET ${updateFields.join(', ')}
            WHERE id = ?
        `, updateValues);
        
        // Log the action in payment history
        await db.execute(`
            INSERT INTO payment_history (user_pack_id, installment_id, action, new_value, notes, created_by)
            SELECT pp.user_pack_id, ?, 'installment_updated', ?, 'Installment details updated', ?
            FROM payment_installments pi
            JOIN payment_plans pp ON pi.payment_plan_id = pp.id
            WHERE pi.id = ?
        `, [installmentId, JSON.stringify(req.body), processed_by, installmentId]);
        
        res.json({ 
            success: true, 
            message: 'Installment updated successfully' 
        });
    } catch (error) {
        console.error('Error updating installment:', error);
        res.status(500).json({ error: 'Failed to update installment' });
    }
});

// Get overdue payments
router.get('/admin/payments/overdue', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const [overdue] = await db.execute(`
            SELECT 
                pi.id as installment_id,
                pi.installment_number,
                pi.amount,
                pi.due_date,
                pi.payment_method,
                pi.rib,
                pi.notes,
                DATEDIFF(CURDATE(), pi.due_date) as days_overdue,
                u.full_name as client_name,
                u.email as client_email,
                u.phone as client_phone,
                u.matricule as client_matricule,
                p.name as pack_name,
                pp.id as payment_plan_id
            FROM payment_installments pi
            JOIN payment_plans pp ON pi.payment_plan_id = pp.id
            JOIN user_packs up ON pp.user_pack_id = up.id
            JOIN users u ON up.user_id = u.id
            JOIN packs p ON up.pack_id = p.id
            WHERE pi.status = 'overdue' OR (pi.status = 'pending' AND pi.due_date < CURDATE())
            ORDER BY pi.due_date ASC
        `);
        
        res.json(overdue);
    } catch (error) {
        console.error('Error fetching overdue payments:', error);
        res.status(500).json({ error: 'Failed to fetch overdue payments' });
    }
});

// Get payment statistics
router.get('/admin/payments/statistics', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const [stats] = await db.execute(`
            SELECT 
                COUNT(DISTINCT pp.id) as total_payment_plans,
                COUNT(DISTINCT CASE WHEN pi.status = 'paid' THEN pp.id END) as fully_paid_plans,
                COUNT(DISTINCT CASE WHEN pi.status IN ('pending', 'overdue') THEN pp.id END) as pending_plans,
                COALESCE(SUM(CASE WHEN pi.status = 'paid' THEN pi.amount ELSE 0 END), 0) as total_collected,
                COALESCE(SUM(CASE WHEN pi.status IN ('pending', 'overdue') THEN pi.amount ELSE 0 END), 0) as total_pending,
                COALESCE(AVG(pp.total_amount), 0) as average_plan_amount,
                COUNT(CASE WHEN pi.status = 'overdue' OR (pi.status = 'pending' AND pi.due_date < CURDATE()) THEN 1 END) as overdue_installments
            FROM payment_plans pp
            LEFT JOIN payment_installments pi ON pp.id = pi.payment_plan_id
        `);
        
        res.json(stats[0]);
    } catch (error) {
        console.error('Error fetching payment statistics:', error);
        res.status(500).json({ error: 'Failed to fetch payment statistics' });
    }
});

// Get payment history for a user pack
router.get('/admin/payments/history/:userPackId', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { userPackId } = req.params;
        
        const [history] = await db.execute(`
            SELECT 
                ph.id,
                ph.action,
                ph.old_value,
                ph.new_value,
                ph.amount,
                ph.notes,
                ph.created_at,
                u.username as created_by_name,
                pi.installment_number
            FROM payment_history ph
            LEFT JOIN users u ON ph.created_by = u.id
            LEFT JOIN payment_installments pi ON ph.installment_id = pi.id
            WHERE ph.user_pack_id = ?
            ORDER BY ph.created_at DESC
        `, [userPackId]);
        
        res.json(history);
    } catch (error) {
        console.error('Error fetching payment history:', error);
        res.status(500).json({ error: 'Failed to fetch payment history' });
    }
});

// Get user packs without payment plans (for creating new payment plans)
router.get('/admin/user-packs/without-payment-plans', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const [userPacks] = await db.execute(`
            SELECT 
                up.id as user_pack_id,
                up.purchased_at,
                up.payment_status,
                u.full_name as client_name,
                u.email as client_email,
                u.phone as client_phone,
                u.matricule as client_matricule,
                p.name as pack_name,
                p.price as pack_price
            FROM user_packs up
            JOIN users u ON up.user_id = u.id
            JOIN packs p ON up.pack_id = p.id
            LEFT JOIN payment_plans pp ON up.id = pp.user_pack_id
            WHERE pp.id IS NULL
            ORDER BY up.purchased_at DESC
        `);
        
        res.json(userPacks);
    } catch (error) {
        console.error('Error fetching user packs without payment plans:', error);
        res.status(500).json({ error: 'Failed to fetch user packs' });
    }
});

// Update overdue payments (run daily)
router.post('/admin/payments/update-overdue', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const [result] = await db.execute('CALL UpdateOverduePayments()');
        
        res.json({ 
            success: true, 
            message: `${result[0][0].updated_count} payments marked as overdue` 
        });
    } catch (error) {
        console.error('Error updating overdue payments:', error);
        res.status(500).json({ error: 'Failed to update overdue payments' });
    }
});

// Cancel an installment
router.put('/admin/payments/installments/:installmentId/cancel', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { installmentId } = req.params;
        const { notes } = req.body;
        const processed_by = req.user.id;
        
        await db.execute(`
            UPDATE payment_installments 
            SET status = 'cancelled', notes = ?, processed_by = ?
            WHERE id = ?
        `, [notes, processed_by, installmentId]);
        
        res.json({ 
            success: true, 
            message: 'Installment cancelled successfully' 
        });
    } catch (error) {
        console.error('Error cancelling installment:', error);
        res.status(500).json({ error: 'Failed to cancel installment' });
    }
});

// Update payment plan details
router.put('/admin/payments/plans/:paymentPlanId', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { paymentPlanId } = req.params;
        const { 
            total_amount, 
            payment_type, 
            notes 
        } = req.body;
        
        const updated_by = req.user.id;
        
        await db.execute(`
            UPDATE payment_plans 
            SET total_amount = ?, payment_type = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [total_amount, payment_type, notes, paymentPlanId]);
        
        // Log the action in payment history
        await db.execute(`
            INSERT INTO payment_history (user_pack_id, action, new_value, notes, created_by)
            SELECT user_pack_id, 'plan_updated', ?, 'Payment plan details updated', ?
            FROM payment_plans
            WHERE id = ?
        `, [JSON.stringify(req.body), updated_by, paymentPlanId]);
        
        res.json({ 
            success: true, 
            message: 'Payment plan updated successfully' 
        });
    } catch (error) {
        console.error('Error updating payment plan:', error);
        res.status(500).json({ error: 'Failed to update payment plan' });
    }
});

// Delete a payment plan
router.delete('/admin/payments/plans/:paymentPlanId', verifyToken, verifyAdmin, async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { paymentPlanId } = req.params;
        const deleted_by = req.user.id;
        
        // Get payment plan details before deletion for logging
        const [planDetails] = await connection.execute(`
            SELECT pp.*, u.full_name as client_name, p.name as pack_name
            FROM payment_plans pp
            JOIN user_packs up ON pp.user_pack_id = up.id
            JOIN users u ON up.user_id = u.id
            JOIN packs p ON up.pack_id = p.id
            WHERE pp.id = ?
        `, [paymentPlanId]);
        
        if (planDetails.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Payment plan not found' });
        }
        
        const plan = planDetails[0];
        
        // Check if any installments are already paid
        const [paidInstallments] = await connection.execute(`
            SELECT COUNT(*) as paid_count FROM payment_installments 
            WHERE payment_plan_id = ? AND status = 'paid'
        `, [paymentPlanId]);
        
        if (paidInstallments[0].paid_count > 0) {
            await connection.rollback();
            return res.status(400).json({ 
                error: 'Cannot delete payment plan with paid installments. Please mark installments as unpaid first.' 
            });
        }
        
        // Log the deletion in payment history before deleting
        await connection.execute(`
            INSERT INTO payment_history (user_pack_id, action, old_value, notes, created_by)
            VALUES (?, 'plan_deleted', ?, 'Payment plan deleted by admin', ?)
        `, [plan.user_pack_id, JSON.stringify(plan), deleted_by]);
        
        // Delete installments first (due to foreign key constraints)
        await connection.execute(`
            DELETE FROM payment_installments WHERE payment_plan_id = ?
        `, [paymentPlanId]);
        
        // Delete the payment plan
        await connection.execute(`
            DELETE FROM payment_plans WHERE id = ?
        `, [paymentPlanId]);
        
        // Reset user pack payment status
        await connection.execute(`
            UPDATE user_packs SET payment_status = 'pending' WHERE id = ?
        `, [plan.user_pack_id]);
        
        await connection.commit();
        
        res.json({ 
            success: true, 
            message: `Payment plan for ${plan.client_name} deleted successfully` 
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Error deleting payment plan:', error);
        res.status(500).json({ error: 'Failed to delete payment plan' });
    } finally {
        connection.release();
    }
});

module.exports = router;
