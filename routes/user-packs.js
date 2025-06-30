const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAuthenticated } = require('../utils/authMiddleware');

// Get all packs purchased by the current user
router.get('/my-packs', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const [userPacks] = await db.execute(`
            SELECT up.*, p.name, p.description, p.points, p.price 
            FROM user_packs up
            JOIN packs p ON up.pack_id = p.id
            WHERE up.user_id = ?
            ORDER BY up.purchased_at DESC
        `, [userId]);
        
        res.json(userPacks);
    } catch (error) {
        console.error('Error fetching user packs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Purchase a pack
router.post('/purchase/:packId', isAuthenticated, async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const userId = req.user.userId;
        const packId = req.params.packId;
        const { paymentReference } = req.body;
        
        // Check if pack exists and is active
        const [packs] = await connection.execute(
            'SELECT * FROM packs WHERE id = ? AND is_active = 1', 
            [packId]
        );
        
        if (packs.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Pack not found or inactive' });
        }
        
        const pack = packs[0];
        
        // Record the purchase
        const [purchaseResult] = await connection.execute(
            'INSERT INTO user_packs (user_id, pack_id, payment_status, payment_reference) VALUES (?, ?, ?, ?)',
            [userId, packId, 'completed', paymentReference || null]
        );
        
        // Add points to user's account
        await connection.execute(
            'UPDATE users SET points = points + ? WHERE id = ?',
            [pack.points, userId]
        );
        
        // Get updated user points
        const [userResult] = await connection.execute(
            'SELECT points FROM users WHERE id = ?',
            [userId]
        );
        
        await connection.commit();
        
        // Send notification to user about points update if you have a notification system
        if (global.notifyUser) {
            global.notifyUser(userId, {
                type: 'pack_purchased',
                points: pack.points,
                new_balance: userResult[0].points,
                timestamp: new Date().toISOString(),
                message: `You have purchased the ${pack.name} pack and received ${pack.points} points. Your new balance is ${userResult[0].points} points.`
            });
        }
        
        res.status(201).json({
            message: `Successfully purchased ${pack.name}`,
            points_added: pack.points,
            new_balance: userResult[0].points,
            purchase_id: purchaseResult.insertId
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Error purchasing pack:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
});

module.exports = router;
