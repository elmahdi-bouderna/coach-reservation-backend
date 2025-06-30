const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyAdmin } = require('./auth');

// Get all packs (public route - clients can see all active packs)
router.get('/', async (req, res) => {
    try {
        const [packs] = await db.execute('SELECT * FROM packs WHERE is_active = 1 ORDER BY points ASC');
        res.json(packs);
    } catch (error) {
        console.error('Error fetching packs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all packs including inactive ones (admin only)
router.get('/admin/all', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const [packs] = await db.execute('SELECT * FROM packs ORDER BY created_at DESC');
        res.json(packs);
    } catch (error) {
        console.error('Error fetching all packs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get a specific pack by ID (public route)
router.get('/:id', async (req, res) => {
    try {
        const [packs] = await db.execute('SELECT * FROM packs WHERE id = ?', [req.params.id]);
        
        if (packs.length === 0) {
            return res.status(404).json({ error: 'Pack not found' });
        }
        
        res.json(packs[0]);
    } catch (error) {
        console.error('Error fetching pack:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin routes below

// Create a new pack (admin only)
router.post('/', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { name, description, points, solo_points, team_points, price } = req.body;
        
        // Validate input
        if (!name) {
            return res.status(400).json({ error: 'Pack name is required' });
        }
        
        // Ensure at least one of the points fields is provided and positive
        if ((!solo_points || solo_points <= 0) && (!team_points || team_points <= 0)) {
            return res.status(400).json({ 
                error: 'At least one point type (solo_points or team_points) must have a positive value' 
            });
        }
        
        // Calculate total points (for backward compatibility)
        const totalPoints = (solo_points || 0) + (team_points || 0);
        
        const [result] = await db.execute(
            'INSERT INTO packs (name, description, points, solo_points, team_points, price) VALUES (?, ?, ?, ?, ?, ?)',
            [name, description || null, totalPoints, solo_points || 0, team_points || 0, price || null]
        );
        
        const [newPack] = await db.execute('SELECT * FROM packs WHERE id = ?', [result.insertId]);
        
        res.status(201).json(newPack[0]);
    } catch (error) {
        console.error('Error creating pack:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update a pack (admin only)
router.put('/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { name, description, points, solo_points, team_points, price, is_active } = req.body;
        const packId = req.params.id;
        
        // Validate input
        if (!name) {
            return res.status(400).json({ error: 'Pack name is required' });
        }
        
        // Ensure at least one of the points fields is provided and positive
        if ((!solo_points || solo_points <= 0) && (!team_points || team_points <= 0)) {
            return res.status(400).json({ 
                error: 'At least one point type (solo_points or team_points) must have a positive value' 
            });
        }
        
        // Check if pack exists
        const [existingPacks] = await db.execute('SELECT * FROM packs WHERE id = ?', [packId]);
        
        if (existingPacks.length === 0) {
            return res.status(404).json({ error: 'Pack not found' });
        }
        
        // Calculate total points (for backward compatibility)
        const totalPoints = (solo_points || 0) + (team_points || 0);
        
        await db.execute(
            'UPDATE packs SET name = ?, description = ?, points = ?, solo_points = ?, team_points = ?, price = ?, is_active = ? WHERE id = ?',
            [name, description || null, totalPoints, solo_points || 0, team_points || 0, price || null, is_active !== undefined ? is_active : 1, packId]
        );
        
        const [updatedPack] = await db.execute('SELECT * FROM packs WHERE id = ?', [packId]);
        
        res.json(updatedPack[0]);
    } catch (error) {
        console.error('Error updating pack:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a pack (admin only)
router.delete('/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const packId = req.params.id;
        
        // Check if pack exists
        const [existingPacks] = await db.execute('SELECT * FROM packs WHERE id = ?', [packId]);
        
        if (existingPacks.length === 0) {
            return res.status(404).json({ error: 'Pack not found' });
        }
        
        // Check if pack is in use
        const [usedPacks] = await db.execute('SELECT COUNT(*) as count FROM user_packs WHERE pack_id = ?', [packId]);
        
        if (usedPacks[0].count > 0) {
            // Don't delete, just mark as inactive
            await db.execute('UPDATE packs SET is_active = 0 WHERE id = ?', [packId]);
            return res.json({ message: 'Pack marked as inactive as it is already in use by users' });
        }
        
        // If not in use, we can safely delete
        await db.execute('DELETE FROM packs WHERE id = ?', [packId]);
        
        res.json({ message: 'Pack deleted successfully' });
    } catch (error) {
        console.error('Error deleting pack:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all user packs (admin only)
router.get('/admin/user-packs', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const [userPacks] = await db.execute(`
            SELECT up.*, u.username, u.email, u.full_name, p.name as pack_name, p.points 
            FROM user_packs up
            JOIN users u ON up.user_id = u.id
            JOIN packs p ON up.pack_id = p.id
            ORDER BY up.purchased_at DESC
        `);
        
        res.json(userPacks);
    } catch (error) {
        console.error('Error fetching user packs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin assign pack to user
router.post('/admin/assign/:userId/:packId', verifyToken, verifyAdmin, async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const userId = req.params.userId;
        const packId = req.params.packId;
        const { notes } = req.body;
        
        // Check if user exists
        const [users] = await connection.execute(
            'SELECT * FROM users WHERE id = ?', 
            [userId]
        );
        
        if (users.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'User not found' });
        }
        
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
        const user = users[0];
        
        // Record the pack assignment
        const [assignmentResult] = await connection.execute(
            'INSERT INTO user_packs (user_id, pack_id, payment_status, payment_reference) VALUES (?, ?, ?, ?)',
            [userId, packId, 'completed', `Admin assigned - ${notes || 'No notes'}`]
        );
        
        // Add points to user's account
        await connection.execute(
            'UPDATE users SET points = points + ?, solo_points = solo_points + ?, team_points = team_points + ? WHERE id = ?',
            [pack.points, pack.solo_points || 0, pack.team_points || 0, userId]
        );
        
        // Get updated user points
        const [userResult] = await connection.execute(
            'SELECT points, solo_points, team_points FROM users WHERE id = ?',
            [userId]
        );
        
        await connection.commit();
        
        // Send notification to user about points update if available
        if (global.notifyUser) {
            global.notifyUser(userId, {
                type: 'pack_assigned',
                points: pack.points,
                solo_points: pack.solo_points || 0,
                team_points: pack.team_points || 0,
                new_balance: userResult[0].points,
                new_solo_balance: userResult[0].solo_points,
                new_team_balance: userResult[0].team_points,
                timestamp: new Date().toISOString(),
                message: `An administrator has assigned you the ${pack.name} pack. You received ${pack.solo_points || 0} solo points and ${pack.team_points || 0} team points. Your new balance is ${userResult[0].solo_points} solo points and ${userResult[0].team_points} team points.`
            });
        }
        
        res.status(201).json({
            message: `Successfully assigned ${pack.name} to ${user.full_name || user.username}`,
            points_added: pack.points,
            solo_points_added: pack.solo_points || 0,
            team_points_added: pack.team_points || 0,
            new_balance: userResult[0].points,
            new_solo_balance: userResult[0].solo_points,
            new_team_balance: userResult[0].team_points,
            assignment_id: assignmentResult.insertId
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Error assigning pack:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
});

module.exports = router;
