const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyAdmin } = require('./auth');

// Get all active group courses (public route)
router.get('/', async (req, res) => {
    try {
        console.log('Fetching active group courses...');
        const [courses] = await db.execute(`
            SELECT gc.*, c.name as coach_name, c.specialty, c.photo,
                   (SELECT COUNT(*) FROM group_reservations gr WHERE gr.course_id = gc.id AND gr.status = 'confirmed') as current_participants
            FROM group_courses gc
            JOIN coaches c ON gc.coach_id = c.id
            WHERE gc.is_active = 1
            ORDER BY gc.date ASC, gc.time ASC
        `);
        
        console.log(`Found ${courses.length} active group courses`);
        res.json(courses);
    } catch (error) {
        console.error('Error fetching group courses:', error);
        
        // Check if it's a table not found error
        if (error.errno === 1146 || error.code === 'ER_NO_SUCH_TABLE') {
            console.error('Group courses table does not exist. Database may need to be initialized.');
            return res.status(503).json({ 
                error: 'Database not properly initialized. Group courses table is missing.',
                code: 'TABLE_NOT_FOUND',
                table: error.message.includes('group_courses') ? 'group_courses' : 'group_reservations'
            });
        }
        
        // Check if it's a database connection error
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('Database connection failed:', error.code);
            return res.status(503).json({ 
                error: 'Database service unavailable',
                code: 'DB_CONNECTION_FAILED'
            });
        }
        
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Get all group course bookings for the logged-in user
router.get('/my-bookings', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        console.log('Fetching group bookings for user ID:', userId);
        console.log('User object from token:', req.user);
        
        // Check if user ID is valid
        if (!userId) {
            console.error('No user ID available in the request');
            return res.status(400).json({ error: 'User ID not available' });
        }
        
        const [bookings] = await db.execute(`
            SELECT gr.id, gr.status, gr.created_at, gr.cancelled_at, gr.cancelled_by,
                   gc.id as course_id, gc.title, gc.description, gc.date, gc.time, gc.duration,
                   c.id as coach_id, c.name as coach_name, c.photo as coach_photo
            FROM group_reservations gr
            JOIN group_courses gc ON gr.course_id = gc.id
            JOIN coaches c ON gc.coach_id = c.id
            WHERE gr.user_id = ?
            ORDER BY gc.date DESC, gc.time DESC
        `, [userId]);
        
        console.log(`Found ${bookings.length} group bookings for user ${userId}`);
        res.json(bookings);
    } catch (error) {
        console.error('Error fetching user group bookings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get single group course
router.get('/:id', async (req, res) => {
    try {
        const [courses] = await db.execute(`
            SELECT gc.*, c.name as coach_name, c.specialty, c.photo,
                   (SELECT COUNT(*) FROM group_reservations gr WHERE gr.course_id = gc.id AND gr.status = 'confirmed') as current_participants
            FROM group_courses gc
            JOIN coaches c ON gc.coach_id = c.id
            WHERE gc.id = ?
        `, [req.params.id]);
        
        if (courses.length === 0) {
            return res.status(404).json({ error: 'Group course not found' });
        }
        
        res.json(courses[0]);
    } catch (error) {
        console.error('Error fetching group course:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin: Create new group course
router.post('/', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { title, description, coach_id, date, time, duration, max_participants } = req.body;
        
        // Validate required fields
        if (!title || !coach_id || !date || !time) {
            return res.status(400).json({ error: 'Title, coach, date, and time are required' });
        }
        
        // Verify the coach exists
        const [coaches] = await db.execute('SELECT id FROM coaches WHERE id = ?', [coach_id]);
        if (coaches.length === 0) {
            return res.status(400).json({ error: 'Selected coach does not exist' });
        }
        
        // Create the group course
        const [result] = await db.execute(`
            INSERT INTO group_courses 
            (title, description, coach_id, date, time, duration, max_participants)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            title, 
            description || null, 
            coach_id, 
            date, 
            time, 
            duration || 60, 
            max_participants || 10
        ]);
        
        // Get the created course
        const [newCourse] = await db.execute(`
            SELECT gc.*, c.name as coach_name
            FROM group_courses gc
            JOIN coaches c ON gc.coach_id = c.id
            WHERE gc.id = ?
        `, [result.insertId]);
        
        res.status(201).json(newCourse[0]);
    } catch (error) {
        console.error('Error creating group course:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin: Update group course
router.put('/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { title, description, coach_id, date, time, duration, max_participants, is_active } = req.body;
        const courseId = req.params.id;
        
        // Validate required fields
        if (!title || !coach_id || !date || !time) {
            return res.status(400).json({ error: 'Title, coach, date, and time are required' });
        }
        
        // Check if course exists
        const [existingCourses] = await db.execute('SELECT * FROM group_courses WHERE id = ?', [courseId]);
        
        if (existingCourses.length === 0) {
            return res.status(404).json({ error: 'Group course not found' });
        }
        
        // Check if reducing max_participants would kick out existing participants
        if (max_participants) {
            const [participantCount] = await db.execute(`
                SELECT COUNT(*) as count FROM group_reservations 
                WHERE course_id = ? AND status = 'confirmed'
            `, [courseId]);
            
            if (participantCount[0].count > max_participants) {
                return res.status(400).json({ 
                    error: `Cannot reduce max participants to ${max_participants} as there are already ${participantCount[0].count} confirmed participants`
                });
            }
        }
        
        // Update the course
        await db.execute(`
            UPDATE group_courses SET
            title = ?, description = ?, coach_id = ?, date = ?, time = ?,
            duration = ?, max_participants = ?, is_active = ?
            WHERE id = ?
        `, [
            title,
            description || null,
            coach_id,
            date,
            time,
            duration || 60,
            max_participants || 10,
            is_active !== undefined ? is_active : 1,
            courseId
        ]);
        
        // Get the updated course
        const [updatedCourse] = await db.execute(`
            SELECT gc.*, c.name as coach_name,
                   (SELECT COUNT(*) FROM group_reservations gr WHERE gr.course_id = gc.id AND gr.status = 'confirmed') as current_participants
            FROM group_courses gc
            JOIN coaches c ON gc.coach_id = c.id
            WHERE gc.id = ?
        `, [courseId]);
        
        res.json(updatedCourse[0]);
    } catch (error) {
        console.error('Error updating group course:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin: Delete/cancel group course
router.delete('/:id', verifyToken, verifyAdmin, async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const courseId = req.params.id;
        const { refundPoints = true } = req.body;
        
        // Check if course exists
        const [courses] = await connection.execute('SELECT * FROM group_courses WHERE id = ?', [courseId]);
        
        if (courses.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Group course not found' });
        }
        
        // Check if the course already took place
        const courseDate = new Date(courses[0].date);
        const [hours, minutes] = courses[0].time.split(':').map(Number);
        courseDate.setHours(hours, minutes, 0, 0);
        
        if (courseDate < new Date()) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'Cannot delete a group course that has already taken place' });
        }
        
        // Get participants to refund their points
        if (refundPoints) {
            const [participants] = await connection.execute(`
                SELECT gr.id, gr.user_id
                FROM group_reservations gr
                WHERE gr.course_id = ? AND gr.status = 'confirmed'
            `, [courseId]);
            
            // Refund team points to all participants
            for (const participant of participants) {
                // Mark the reservation as cancelled
                await connection.execute(`
                    UPDATE group_reservations
                    SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = 'admin'
                    WHERE id = ?
                `, [participant.id]);
                
                // Refund the team point
                await connection.execute(`
                    UPDATE users
                    SET points = points + 1, team_points = team_points + 1
                    WHERE id = ?
                `, [participant.user_id]);
                
                // Notify the user if possible
                if (global.notifyUser) {
                    global.notifyUser(participant.user_id, {
                        type: 'group_course_cancelled',
                        message: `The group course you were registered for has been cancelled by an administrator. Your team point has been refunded.`,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        }
        
        // Mark the course as inactive instead of deleting it to preserve history
        await connection.execute(`
            UPDATE group_courses SET is_active = 0 WHERE id = ?
        `, [courseId]);
        
        await connection.commit();
        
        res.json({ 
            message: 'Group course cancelled successfully',
            refunded_participants: refundPoints ? true : false
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error cancelling group course:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
});

// Client: Book a spot in a group course
router.post('/:id/book', verifyToken, async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const courseId = req.params.id;
        const userId = req.user.id;
        
        // Check if the course exists and is active
        const [courses] = await connection.execute(`
            SELECT gc.*, 
                   (SELECT COUNT(*) FROM group_reservations gr WHERE gr.course_id = gc.id AND gr.status = 'confirmed') as current_participants
            FROM group_courses gc
            WHERE gc.id = ? AND gc.is_active = 1
        `, [courseId]);
        
        if (courses.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Group course not found or inactive' });
        }
        
        const course = courses[0];
        
        // Check if the course is in the past
        const courseDate = new Date(course.date);
        const [hours, minutes] = course.time.split(':').map(Number);
        courseDate.setHours(hours, minutes, 0, 0);
        
        if (courseDate < new Date()) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'Cannot book a spot in a past group course' });
        }
        
        // Check if the course is full
        if (course.current_participants >= course.max_participants) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'This group course is already at maximum capacity' });
        }
        
        // Check if user already has a confirmed booking for this course
        const [existingBookings] = await connection.execute(`
            SELECT id FROM group_reservations
            WHERE course_id = ? AND user_id = ? AND status = 'confirmed'
        `, [courseId, userId]);
        
        if (existingBookings.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'You already have a confirmed booking for this group course' });
        }
        
        // Check if user has enough team points
        const [userPoints] = await connection.execute(`
            SELECT team_points FROM users WHERE id = ?
        `, [userId]);
        
        if (userPoints.length === 0 || userPoints[0].team_points < 1) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ 
                error: 'You do not have enough team points to book this group course',
                required_points: 1,
                current_points: userPoints.length ? userPoints[0].team_points : 0
            });
        }
        
        // Deduct a team point from the user
        await connection.execute(`
            UPDATE users SET points = points - 1, team_points = team_points - 1 WHERE id = ?
        `, [userId]);
        
        // Create the booking
        const [bookingResult] = await connection.execute(`
            INSERT INTO group_reservations (course_id, user_id)
            VALUES (?, ?)
        `, [courseId, userId]);
        
        // Get the user's updated points
        const [updatedPoints] = await connection.execute(`
            SELECT points, solo_points, team_points FROM users WHERE id = ?
        `, [userId]);
        
        await connection.commit();
        
        // Return success response
        res.status(201).json({
            message: 'Group course booked successfully',
            booking_id: bookingResult.insertId,
            course_id: course.id,
            course_title: course.title,
            date: course.date,
            time: course.time,
            team_points_deducted: 1,
            remaining_points: updatedPoints[0].points,
            remaining_solo_points: updatedPoints[0].solo_points,
            remaining_team_points: updatedPoints[0].team_points
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Error booking group course:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
});

// Client: Cancel a group course booking
router.post('/:id/cancel', verifyToken, async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const courseId = req.params.id;
        const userId = req.user.id;
        
        // Find the user's booking
        const [bookings] = await connection.execute(`
            SELECT gr.id, gc.date, gc.time
            FROM group_reservations gr
            JOIN group_courses gc ON gr.course_id = gc.id
            WHERE gr.course_id = ? AND gr.user_id = ? AND gr.status = 'confirmed'
        `, [courseId, userId]);
        
        if (bookings.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Booking not found or already cancelled' });
        }
        
        const booking = bookings[0];
        
        // Check if the course is in the past
        const courseDate = new Date(booking.date);
        const [hours, minutes] = booking.time.split(':').map(Number);
        courseDate.setHours(hours, minutes, 0, 0);
        
        if (courseDate < new Date()) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'Cannot cancel a booking for a past group course' });
        }
        
        // Check if the course is within 6 hours (same rule as individual sessions)
        const sixHoursInMilliseconds = 6 * 60 * 60 * 1000;
        const timeUntilCourse = courseDate.getTime() - new Date().getTime();
        
        if (timeUntilCourse < sixHoursInMilliseconds) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ 
                error: 'Cannot cancel bookings within 6 hours of the scheduled time. Please contact an administrator if you need assistance.'
            });
        }
        
        // Mark the booking as cancelled
        await connection.execute(`
            UPDATE group_reservations
            SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = 'client'
            WHERE id = ?
        `, [booking.id]);
        
        // Get current points
        const [currentPoints] = await connection.execute(`
            SELECT points, solo_points, team_points FROM users WHERE id = ?
        `, [userId]);
        
        // Refund the team point
        await connection.execute(`
            UPDATE users
            SET points = points + 1, team_points = team_points + 1
            WHERE id = ?
        `, [userId]);
        
        // Get updated points
        const [updatedPoints] = await connection.execute(`
            SELECT points, solo_points, team_points FROM users WHERE id = ?
        `, [userId]);
        
        await connection.commit();
        
        // Return success response
        res.json({
            message: 'Group course booking cancelled successfully',
            booking_id: booking.id,
            course_id: courseId,
            team_points_refunded: 1,
            previous_points: currentPoints[0].points,
            previous_team_points: currentPoints[0].team_points,
            updated_points: updatedPoints[0].points,
            updated_solo_points: updatedPoints[0].solo_points,
            updated_team_points: updatedPoints[0].team_points
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Error cancelling group course booking:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        connection.release();
    }
});

// Admin: Get all bookings for a specific group course
router.get('/:id/bookings', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const courseId = req.params.id;
        
        const [bookings] = await db.execute(`
            SELECT gr.id, gr.status, gr.created_at, gr.cancelled_at, gr.cancelled_by,
                   u.id as user_id, u.username, u.full_name, u.email, u.phone
            FROM group_reservations gr
            JOIN users u ON gr.user_id = u.id
            WHERE gr.course_id = ?
            ORDER BY gr.created_at
        `, [courseId]);
        
        res.json(bookings);
    } catch (error) {
        console.error('Error fetching course bookings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
