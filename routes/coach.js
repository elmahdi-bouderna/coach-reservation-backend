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
            'SELECT r.* FROM reservations r ' +
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

// Get coach's availability
router.get('/availability', verifyToken, verifyCoach, async (req, res) => {
    try {
        const [availability] = await db.execute(
            'SELECT * FROM coach_availability ' +
            'WHERE coach_id = ? ' +
            'ORDER BY date ASC, start_time ASC', 
            [req.user.coachId]
        );

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
