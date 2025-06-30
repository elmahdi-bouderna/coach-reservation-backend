const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken } = require('./auth');

// Get user profile with booked sessions and assigned packs
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        
        // Get user basic information
        const [userResult] = await db.execute(`
            SELECT id, matricule, username, email, full_name, phone, age, gender, goal, points, solo_points, team_points, created_at as member_since
            FROM users 
            WHERE id = ?
        `, [userId]);
        
        if (userResult.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = userResult[0];
        
        // Get user's booked sessions
        const [reservations] = await db.execute(`
            SELECT 
                r.id,
                r.date,
                r.time,
                r.status,
                r.created_at,
                c.name as coach_name,
                c.specialty as coach_specialty
            FROM reservations r
            JOIN coaches c ON r.coach_id = c.id
            WHERE r.user_id = ?
            ORDER BY r.date DESC, r.time DESC
        `, [userId]);
        
        // Get user's assigned packs
        const [userPacks] = await db.execute(`
            SELECT 
                up.id as assignment_id,
                up.purchased_at,
                up.payment_status,
                p.id as pack_id,
                p.name as pack_name,
                p.description as pack_description,
                p.points as pack_points,
                p.solo_points,
                p.team_points,
                p.price as pack_price
            FROM user_packs up
            JOIN packs p ON up.pack_id = p.id
            WHERE up.user_id = ?
            ORDER BY up.purchased_at DESC
        `, [userId]);
        
        // Calculate session statistics
        const totalSessions = reservations.length;
        const confirmedSessions = reservations.filter(r => r.status === 'confirmed').length;
        const pendingSessions = reservations.filter(r => r.status === 'pending').length;
        const cancelledSessions = reservations.filter(r => r.status === 'cancelled').length;
        
        // Calculate pack statistics
        const totalPacksAssigned = userPacks.length;
        const totalPointsFromPacks = userPacks.reduce((sum, pack) => sum + pack.pack_points, 0);
        
        const profile = {
            user: {
                ...user,
                solo_points: user.solo_points || 0,
                team_points: user.team_points || 0,
                member_since: user.member_since
            },
            sessions: {
                total: totalSessions,
                confirmed: confirmedSessions,
                pending: pendingSessions,
                cancelled: cancelledSessions,
                list: reservations
            },
            packs: {
                total_assigned: totalPacksAssigned,
                total_points_received: totalPointsFromPacks,
                list: userPacks.map(pack => ({
                    id: pack.assignment_id,
                    pack_id: pack.pack_id,
                    name: pack.pack_name,
                    description: pack.pack_description,
                    points: pack.pack_points,
                    solo_points: pack.solo_points || 0,
                    team_points: pack.team_points || 0,
                    price: pack.pack_price,
                    purchased_at: pack.purchased_at,
                    payment_status: pack.payment_status
                }))
            },
            statistics: {
                current_points: user.points,
                solo_points: user.solo_points || 0,
                team_points: user.team_points || 0,
                points_used: totalPointsFromPacks - user.points,
                sessions_available: user.points // Since each session costs 1 point
            }
        };
        
        res.json(profile);
        
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user profile information
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { full_name, phone, age, gender, goal } = req.body;
        
        await db.execute(`
            UPDATE users 
            SET full_name = ?, phone = ?, age = ?, gender = ?, goal = ?
            WHERE id = ?
        `, [full_name, phone, age, gender, goal, userId]);
        
        res.json({ message: 'Profile updated successfully' });
        
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
