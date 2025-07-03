const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyCoach } = require('./auth');

// Get coach's own profile
router.get('/profile', verifyToken, verifyCoach, async (req, res) => {
    try {
        const [coaches] = await db.execute(
            'SELECT c.*, u.email, u.matricule FROM coaches c ' +
            'INNER JOIN users u ON c.user_id = u.id ' +
            'WHERE c.id = ?', 
            [req.user.coachId]
        );

        if (coaches.length === 0) {
            return res.status(404).json({ error: 'Coach profile not found' });
        }

        res.json(coaches[0]);
    } catch (error) {
        console.error('Error fetching coach profile:', error);
        res.status(500).json({ error: 'Failed to fetch coach profile' });
    }
});

// Get coach's reservations
router.get('/reservations', verifyToken, verifyCoach, async (req, res) => {
    try {
        const [reservations] = await db.execute(
            'SELECT r.*, c.name as coach_name FROM reservations r ' +
            'JOIN coaches c ON r.coach_id = c.id ' +
            'WHERE r.coach_id = ? AND (r.status IS NULL OR r.status != "cancelled") ' +
            'ORDER BY r.date DESC, r.time DESC', 
            [req.user.coachId]
        );

        res.json(reservations);
    } catch (error) {
        console.error('Error fetching coach reservations:', error);
        res.status(500).json({ error: 'Failed to fetch reservations' });
    }
});

// Get clients who have booked with this coach
router.get('/clients', verifyToken, verifyCoach, async (req, res) => {
    try {
        const coachId = req.user.coachId;
        
        // Get all unique clients who have made reservations with this coach
        const [clients] = await db.execute(`
            SELECT DISTINCT 
                u.id,
                u.full_name,
                u.email,
                u.goal,
                cb.bilan,
                cb.created_at as bilan_created_at,
                cb.updated_at as bilan_updated_at,
                COUNT(r.id) as total_sessions,
                SUM(CASE WHEN r.status = 'completed' OR (r.date < CURDATE() OR (r.date = CURDATE() AND r.time < CURTIME())) THEN 1 ELSE 0 END) as completed_sessions
            FROM users u
            INNER JOIN reservations r ON u.id = r.user_id
            LEFT JOIN client_bilans cb ON cb.client_id = u.id AND cb.coach_id = ?
            WHERE r.coach_id = ?
            GROUP BY u.id, u.full_name, u.email, u.goal, cb.bilan, cb.created_at, cb.updated_at
            ORDER BY u.full_name
        `, [coachId, coachId]);
        
        res.json(clients);
    } catch (error) {
        console.error('Error fetching coach clients:', error);
        res.status(500).json({ error: 'Failed to fetch clients' });
    }
});

// Add or update bilan for a client
router.post('/clients/:clientId/bilan', verifyToken, verifyCoach, async (req, res) => {
    try {
        const clientId = req.params.clientId;
        const { bilan } = req.body;
        const coachId = req.user.coachId;
        
        if (!bilan || bilan.trim() === '') {
            return res.status(400).json({ error: 'Bilan content is required' });
        }
        
        // Verify that this client has at least one reservation with this coach
        const [reservations] = await db.execute(
            'SELECT COUNT(*) as count FROM reservations WHERE user_id = ? AND coach_id = ?',
            [clientId, coachId]
        );
        
        if (reservations[0].count === 0) {
            return res.status(404).json({ error: 'Client has no reservations with this coach' });
        }
        
        // Check if bilan already exists
        const [existingBilan] = await db.execute(
            'SELECT * FROM client_bilans WHERE coach_id = ? AND client_id = ?',
            [coachId, clientId]
        );
        
        if (existingBilan.length > 0) {
            // Update existing bilan
            await db.execute(
                'UPDATE client_bilans SET bilan = ?, updated_at = NOW() WHERE coach_id = ? AND client_id = ?',
                [bilan.trim(), coachId, clientId]
            );
            
            res.json({ 
                message: 'Bilan updated successfully',
                client_id: clientId,
                bilan: bilan.trim(),
                updated_at: new Date()
            });
        } else {
            // Create new bilan
            const [result] = await db.execute(
                'INSERT INTO client_bilans (coach_id, client_id, bilan) VALUES (?, ?, ?)',
                [coachId, clientId, bilan.trim()]
            );
            
            res.status(201).json({ 
                message: 'Bilan created successfully',
                bilan_id: result.insertId,
                client_id: clientId,
                bilan: bilan.trim(),
                created_at: new Date()
            });
        }
        
    } catch (error) {
        console.error('Error adding/updating client bilan:', error);
        res.status(500).json({ error: 'Failed to save bilan' });
    }
});

// Get bilan for a specific client
router.get('/clients/:clientId/bilan', verifyToken, verifyCoach, async (req, res) => {
    try {
        const clientId = req.params.clientId;
        const coachId = req.user.coachId;
        
        // Verify that this client has reservations with this coach
        const [reservations] = await db.execute(
            'SELECT COUNT(*) as count FROM reservations WHERE user_id = ? AND coach_id = ?',
            [clientId, coachId]
        );
        
        if (reservations[0].count === 0) {
            return res.status(404).json({ error: 'Client has no reservations with this coach' });
        }
        
        // Get the bilan
        const [bilans] = await db.execute(
            'SELECT * FROM client_bilans WHERE coach_id = ? AND client_id = ?',
            [coachId, clientId]
        );
        
        if (bilans.length === 0) {
            return res.json({ bilan: null, message: 'No bilan found for this client' });
        }
        
        res.json(bilans[0]);
        
    } catch (error) {
        console.error('Error fetching client bilan:', error);
        res.status(500).json({ error: 'Failed to fetch bilan' });
    }
});

// Get coach's availability
router.get('/availability', verifyToken, verifyCoach, async (req, res) => {
    try {
        // Get current date and time for checking past slots
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
        const currentTime = now.toTimeString().split(' ')[0].substring(0, 8); // HH:MM:SS
        
        const [availability] = await db.execute(`
            SELECT *,
            CASE 
                WHEN date < ? THEN 1
                WHEN date = ? AND start_time <= ? THEN 1
                ELSE 0
            END as is_past
            FROM coach_availability 
            WHERE coach_id = ? 
            ORDER BY date ASC, start_time ASC
        `, [currentDate, currentDate, currentTime, req.user.coachId]);

        res.json(availability);
    } catch (error) {
        console.error('Error fetching coach availability:', error);
        res.status(500).json({ error: 'Failed to fetch availability' });
    }
});

// Update coach's availability
router.post('/availability', verifyToken, verifyCoach, async (req, res) => {
    try {
        const { date, start_time, end_time } = req.body;
        
        // Validate input
        if (!date || !start_time || !end_time) {
            return res.status(400).json({ error: 'Date, start time and end time are required' });
        }
        
        // Insert new availability
        const [result] = await db.execute(
            'INSERT INTO coach_availability (coach_id, date, start_time, end_time) VALUES (?, ?, ?, ?)',
            [req.user.coachId, date, start_time, end_time]
        );
        
        res.status(201).json({ 
            id: result.insertId,
            message: 'Availability added successfully'
        });
    } catch (error) {
        console.error('Error adding coach availability:', error);
        res.status(500).json({ error: 'Failed to add availability' });
    }
});

// Remove coach's availability
router.delete('/availability/:id', verifyToken, verifyCoach, async (req, res) => {
    try {
        const availabilityId = req.params.id;
        
        // Check if availability exists and belongs to this coach
        const [availabilities] = await db.execute(
            'SELECT * FROM coach_availability WHERE id = ? AND coach_id = ?',
            [availabilityId, req.user.coachId]
        );
        
        if (availabilities.length === 0) {
            return res.status(404).json({ error: 'Availability not found or not authorized' });
        }
        
        // Delete the availability
        await db.execute(
            'DELETE FROM coach_availability WHERE id = ?',
            [availabilityId]
        );
        
        res.json({ message: 'Availability removed successfully' });
    } catch (error) {
        console.error('Error removing coach availability:', error);
        res.status(500).json({ error: 'Failed to remove availability' });
    }
});

// Get coach's group courses
router.get('/group-courses', verifyToken, verifyCoach, async (req, res) => {
    try {
        const [courses] = await db.execute(`
            SELECT gc.*, 
                   (SELECT COUNT(*) FROM group_reservations gr 
                    WHERE gr.course_id = gc.id AND gr.status = 'confirmed') as current_participants
            FROM group_courses gc
            WHERE gc.coach_id = ? AND gc.is_active = 1
            ORDER BY gc.date DESC, gc.time DESC
        `, [req.user.coachId]);

        res.json(courses);
    } catch (error) {
        console.error('Error fetching coach group courses:', error);
        res.status(500).json({ error: 'Failed to fetch group courses' });
    }
});

// Get bookings for a specific group course
router.get('/group-courses/:id/bookings', verifyToken, verifyCoach, async (req, res) => {
    try {
        const courseId = req.params.id;
        
        // First check if the course belongs to this coach and is active
        const [courses] = await db.execute(
            'SELECT * FROM group_courses WHERE id = ? AND coach_id = ? AND is_active = 1',
            [courseId, req.user.coachId]
        );
        
        if (courses.length === 0) {
            return res.status(404).json({ error: 'Group course not found or not authorized' });
        }
        
        // Get bookings for this course
        const [bookings] = await db.execute(`
            SELECT gr.*, u.full_name, u.email, u.phone
            FROM group_reservations gr
            JOIN users u ON gr.user_id = u.id
            WHERE gr.course_id = ?
            ORDER BY gr.created_at DESC
        `, [courseId]);
        
        res.json(bookings);
    } catch (error) {
        console.error('Error fetching group course bookings:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

// Update coach's profile
router.put('/profile', verifyToken, verifyCoach, async (req, res) => {
    try {
        const { bio, specialty } = req.body;
        
        // Update coach profile
        await db.execute(
            'UPDATE coaches SET bio = ?, specialty = ? WHERE id = ?',
            [bio, specialty, req.user.coachId]
        );
        
        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Error updating coach profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

module.exports = router;
