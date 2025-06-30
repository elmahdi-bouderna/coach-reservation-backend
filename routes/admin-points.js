const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyAdmin } = require('./auth');

// Client points update endpoint
router.patch('/admin/clients/:id/points', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const clientId = req.params.id;
        const { points, pointType = 'solo', action = 'add' } = req.body;
        
        if (!points || isNaN(points) || points < 0) {
            return res.status(400).json({ error: 'A valid positive points value is required' });
        }
        
        if (!['solo', 'team'].includes(pointType)) {
            return res.status(400).json({ error: 'Point type must be either "solo" or "team"' });
        }
        
        if (!['add', 'remove', 'set'].includes(action)) {
            return res.status(400).json({ error: 'Action must be one of: add, remove, set' });
        }
        
        // Get current user points
        const [users] = await db.execute('SELECT points, solo_points, team_points FROM users WHERE id = ?', [clientId]);
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        
        const user = users[0];
        let newPoints, newSoloPoints, newTeamPoints;
        
        // Determine which points to update
        if (pointType === 'solo') {
            // Update solo points based on action
            if (action === 'add') {
                newSoloPoints = user.solo_points + parseInt(points);
            } else if (action === 'remove') {
                newSoloPoints = Math.max(0, user.solo_points - parseInt(points));
            } else { // action === 'set'
                newSoloPoints = parseInt(points);
            }
            newTeamPoints = user.team_points; // Keep team points unchanged
            
            // Total points is the sum of both types (for backward compatibility)
            newPoints = newSoloPoints + newTeamPoints;
        } else { // pointType === 'team'
            // Update team points based on action
            if (action === 'add') {
                newTeamPoints = user.team_points + parseInt(points);
            } else if (action === 'remove') {
                newTeamPoints = Math.max(0, user.team_points - parseInt(points));
            } else { // action === 'set'
                newTeamPoints = parseInt(points);
            }
            newSoloPoints = user.solo_points; // Keep solo points unchanged
            
            // Total points is the sum of both types (for backward compatibility)
            newPoints = newSoloPoints + newTeamPoints;
        }
        
        // Update the user's points
        await db.execute(
            'UPDATE users SET points = ?, solo_points = ?, team_points = ? WHERE id = ?',
            [newPoints, newSoloPoints, newTeamPoints, clientId]
        );
        
        // Get the updated user data
        const [updatedUser] = await db.execute(`
            SELECT id, username, email, full_name, role, points, solo_points, team_points
            FROM users WHERE id = ?
        `, [clientId]);
        
        // Send real-time notification to the user about points update
        if (global.notifyUser && updatedUser.length > 0) {
            const client = updatedUser[0];
            let pointsChange;
            let actionText = '';
            
            // Determine the points change based on action and point type
            if (action === 'add') {
                pointsChange = parseInt(points);
                actionText = 'added to';
            } else if (action === 'remove') {
                pointsChange = -parseInt(points); // Make negative for proper display
                actionText = 'removed from';
            } else { // action === 'set'
                // For 'set', the change is the difference from previous value
                pointsChange = pointType === 'solo' ? 
                    (newSoloPoints - user.solo_points) : 
                    (newTeamPoints - user.team_points);
                actionText = 'set to';
            }
            
            // Add point type to the notification
            const pointTypeDisplay = pointType === 'solo' ? 'Solo Points (SP)' : 'Team Points (TP)';
            const pointValue = pointType === 'solo' ? client.solo_points : client.team_points;
            
            global.notifyUser(clientId, {
                type: 'points_updated',
                pointType: pointType,
                points: pointValue,
                totalPoints: client.points,
                change: pointsChange,
                action: action,
                timestamp: new Date().toISOString(),
                message: `Your ${pointTypeDisplay} have been updated by an administrator. ${Math.abs(pointsChange)} points ${actionText} your account. New balance: ${pointValue} ${pointTypeDisplay}.`
            });
        }
        
        res.json(updatedUser[0]);
    } catch (error) {
        console.error('Error updating client points:', error);
        res.status(500).json({ error: 'Failed to update client points' });
    }
});

module.exports = router;
