const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { sendReservationConfirmation, sendCoachNotification } = require('../utils/emailService');
const { markOverlappingSlots, freeOverlappingSlots } = require('../utils/availabilityHelpers');

// Create a new reservation
router.post('/reserve', async (req, res) => {
    console.log('\n=== RESERVATION REQUEST RECEIVED ===');
    console.log('Request body:', req.body);
    
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const {
            coach_id,
            full_name,
            email,
            phone,
            age,
            gender,
            goal,
            date,
            time,
            created_by = 'client',
            user_id = null
        } = req.body;

        // Validate required fields
        const missingFields = [];
        if (!coach_id) missingFields.push('coach_id');
        
        // If user_id is not provided, then all personal details are required
        if (!user_id) {
            if (!full_name) missingFields.push('full_name');
            if (!email) missingFields.push('email');
            if (!phone) missingFields.push('phone');
            if (!age) missingFields.push('age');
            if (!gender) missingFields.push('gender');
        }
        
        // These fields are always required
        if (!date) missingFields.push('date');
        if (!time) missingFields.push('time');

        if (missingFields.length > 0) {
            await connection.rollback();
            return res.status(400).json({ 
                error: `Missing required fields: ${missingFields.join(', ')}`,
                missingFields: missingFields 
            });
        }

        // Check if the requested date and time are in the past
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const currentTime = now.toTimeString().split(' ')[0].substring(0, 8); // HH:MM:SS
        
        console.log(`Checking if reservation is in the past: ${date} ${time} vs current ${currentDate} ${currentTime}`);
        
        if (date < currentDate || (date === currentDate && time < currentTime)) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ 
                error: 'Cannot book a session in the past. Please select a future date and time.'
            });
        }

        // Check if the slot is still available
        const [availabilityCheck] = await connection.execute(`
            SELECT id FROM coach_availability 
            WHERE coach_id = ? AND date = ? AND start_time = ? AND is_booked = 0
        `, [coach_id, date, time]);

        if (availabilityCheck.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ 
                error: 'This time slot is no longer available'
            });
        }
        
        let reservationData;
        let params;
        
        // If user_id is provided (logged in user), get user details from the database
        if (user_id) {
            const [userData] = await connection.execute(`
                SELECT full_name, email, phone, age, gender, goal, points, solo_points, team_points 
                FROM users WHERE id = ?
            `, [user_id]);
            
            if (userData.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({ error: 'User not found' });
            }
            
            const user = userData[0];
            
            // Check if user has enough solo points
            if (user.solo_points < 1) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ 
                    error: `Not enough solo points. You need at least 1 solo point to book an individual session. You currently have ${user.solo_points} solo points.`
                });
            }
            
            // Deduct solo points
            console.log(`Deducting 1 solo point from user ${user_id}. Current solo points: ${user.solo_points}`);
            await connection.execute(`
                UPDATE users SET points = points - 1, solo_points = solo_points - 1 WHERE id = ?
            `, [user_id]);
            console.log(`Point deduction query executed for user ${user_id}`);
            
            
            // Use user profile data from database
            reservationData = `
                INSERT INTO reservations (coach_id, full_name, email, phone, age, gender, goal, date, time, created_by, user_id, status, reservation_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'individual')
            `;
            
            params = [
                coach_id, 
                user.full_name, 
                user.email, 
                user.phone, 
                user.age, 
                user.gender, 
                goal || user.goal, // Allow overriding goal for this specific session
                date, 
                time, 
                created_by,
                user_id
            ];
        } else {
            // No user_id, use data from the request
            reservationData = `
                INSERT INTO reservations (coach_id, full_name, email, phone, age, gender, goal, date, time, created_by, status, reservation_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'individual')
            `;
            
            params = [
                coach_id, 
                full_name, 
                email, 
                phone, 
                age, 
                gender, 
                goal, 
                date, 
                time, 
                created_by
            ];
        }

        // Get the selected slot's details
        const [selectedSlot] = await connection.execute(`
            SELECT start_time, end_time
            FROM coach_availability 
            WHERE coach_id = ? AND date = ? AND start_time = ?
        `, [coach_id, date, time]);

        if (selectedSlot.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'Selected time slot not found' });
        }

        // Create the reservation
        const [reservationResult] = await connection.execute(reservationData, params);

        // Mark the selected slot and any overlapping slots as booked
        const overlappingSlotsCount = await markOverlappingSlots(
            connection,
            coach_id,
            date,
            selectedSlot[0].start_time,
            selectedSlot[0].end_time,
            reservationResult.insertId  // Pass the reservation ID
        );

        // Get updated points if user_id is provided
        let updatedPoints = null;
        let updatedSoloPoints = null;
        let updatedTeamPoints = null;
        if (user_id) {
            const [pointsResult] = await connection.execute('SELECT points, solo_points, team_points FROM users WHERE id = ?', [user_id]);
            updatedPoints = pointsResult[0].points;
            updatedSoloPoints = pointsResult[0].solo_points;
            updatedTeamPoints = pointsResult[0].team_points;
        }

        // Get coach details for the response and email
        const [coachDetails] = await connection.execute('SELECT name, email FROM coaches WHERE id = ?', [coach_id]);
        
        if (coachDetails.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Coach not found' });
        }
        
        const coach = coachDetails[0];

        // Commit the transaction
        await connection.commit();
        connection.release();
        
        // Format the reservation details for the response
        const reservation = {
            id: reservationResult.insertId,
            coach_id,
            coach_name: coach.name,
            full_name: params[1], // full_name is the second parameter in both query variations
            email: params[2],     // email is the third parameter
            phone: params[3],
            age: params[4],
            gender: params[5],
            goal: params[6],
            date,
            time,
            created_at: new Date(),
            points_deducted: 1,
            solo_points_deducted: 1,
            team_points_deducted: 0,
            remaining_points: updatedPoints,
            remaining_solo_points: updatedSoloPoints,
            remaining_team_points: updatedTeamPoints,
            reservation_type: 'individual'
        };
        
        console.log('Reservation created successfully');
        
        // Send the successful response immediately
        res.status(201).json(reservation);
        
        // Try to send email notifications asynchronously (non-blocking)
        // We moved this after the response to prevent delays for the client
        setTimeout(async () => {
            try {
                // Send email to client
                if (reservation.email) {
                    console.log(`Sending confirmation email to client: ${reservation.email}`);
                    await sendReservationConfirmation(reservation);
                }
                
                // Send email to coach
                if (coach.email) {
                    console.log(`Sending notification email to coach: ${coach.email}`);
                    await sendCoachNotification(reservation, coach.email);
                }
            } catch (emailError) {
                console.error('Error sending email notifications:', emailError);
                // We don't want to fail the reservation if emails fail
            }
        }, 0);
    } catch (error) {
        console.error('Error creating reservation:', error);
        
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('Error rolling back transaction:', rollbackError);
        }
        
        connection.release();
        
        res.status(500).json({ 
            error: 'Failed to create reservation',
            message: error.message
        });
    }
});

// Cancel a reservation (admin only)
router.post('/cancel/:id', async (req, res) => {
    console.log(`\n=== CANCELLATION REQUEST FOR RESERVATION ID: ${req.params.id} ===`);
    
    // Get a connection from the pool for transaction
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const reservationId = req.params.id;
        const { refundPoints = true } = req.body;
        
        console.log(`Processing cancellation for reservation ${reservationId}, refund points: ${refundPoints}`);
        
        // First, get the reservation details with slot times
        const [reservationData] = await connection.execute(`
            SELECT r.*, ca.id as availability_id, ca.start_time, ca.end_time 
            FROM reservations r
            JOIN coach_availability ca ON r.coach_id = ca.coach_id AND r.date = ca.date AND r.time = ca.start_time
            WHERE r.id = ?
        `, [reservationId]);
        
        if (reservationData.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Reservation not found' });
        }
        
        const reservation = reservationData[0];
        console.log(`Found reservation for ${reservation.full_name} on ${reservation.date} at ${reservation.time}`);
        
        // Check if the reservation is in the past
        const now = new Date();
        const reservationDate = new Date(reservation.date);
        const [hours, minutes] = reservation.time.split(':').map(Number);
        reservationDate.setHours(hours, minutes, 0, 0);
        
        if (reservationDate < now) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ 
                error: 'Cannot cancel past reservations. The session has already occurred.'
            });
        }
        
        // Check if the slot exists and is booked
        const [availabilityCheck] = await connection.execute(`
            SELECT is_booked FROM coach_availability 
            WHERE id = ?
        `, [reservation.availability_id]);
        
        if (availabilityCheck.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Availability slot not found' });
        }
        
        if (availabilityCheck[0].is_booked !== 1) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'This time slot is not currently booked' });
        }

        // Mark all overlapping slots as available
        const freedSlotsCount = await freeOverlappingSlots(
            connection,
            reservation.coach_id,
            reservation.date,
            reservation.start_time,
            reservation.end_time,
            true // this is the admin cancellation endpoint
        );
        
        console.log(`Freed ${freedSlotsCount} overlapping availability slots`);
        
        // If we need to refund points and there is a user associated with this reservation
        if (refundPoints && reservation.user_id) {
            // Get current points for logging
            const [currentPoints] = await connection.execute('SELECT points, solo_points, team_points FROM users WHERE id = ?', [reservation.user_id]);
            const beforePoints = currentPoints[0]?.points || 0;
            const beforeSoloPoints = currentPoints[0]?.solo_points || 0;
            const beforeTeamPoints = currentPoints[0]?.team_points || 0;
            
            // Check reservation type to determine which points to refund
            if (reservation.reservation_type === 'individual') {
                console.log(`Refunding 1 solo point to user ID: ${reservation.user_id}. Current solo points: ${beforeSoloPoints}`);
                
                // Refund the solo point to the user
                await connection.execute(`
                    UPDATE users 
                    SET points = points + 1, solo_points = solo_points + 1 
                    WHERE id = ?
                `, [reservation.user_id]);
            } else if (reservation.reservation_type === 'group') {
                console.log(`Refunding 1 team point to user ID: ${reservation.user_id}. Current team points: ${beforeTeamPoints}`);
                
                // Refund the team point to the user
                await connection.execute(`
                    UPDATE users 
                    SET points = points + 1, team_points = team_points + 1 
                    WHERE id = ?
                `, [reservation.user_id]);
            }
            
            console.log(`Point refund query executed for user ${reservation.user_id}`);
            
            // Get updated points for response
            const [pointsResult] = await connection.execute('SELECT points, solo_points, team_points FROM users WHERE id = ?', [reservation.user_id]);
            const afterPoints = pointsResult[0]?.points || 0;
            const afterSoloPoints = pointsResult[0]?.solo_points || 0;
            const afterTeamPoints = pointsResult[0]?.team_points || 0;
            
            console.log(`Points updated from ${beforePoints} to ${afterPoints} for user ${reservation.user_id}`);
            console.log(`SoloPoints updated from ${beforeSoloPoints} to ${afterSoloPoints} for user ${reservation.user_id}`);
            console.log(`TeamPoints updated from ${beforeTeamPoints} to ${afterTeamPoints} for user ${reservation.user_id}`);
            
            reservation.refunded_points = 1;
            reservation.updated_points = afterPoints;
            reservation.updated_solo_points = afterSoloPoints;
            reservation.updated_team_points = afterTeamPoints;
            
            if (reservation.reservation_type === 'individual') {
                reservation.refunded_solo_points = 1;
                reservation.refunded_team_points = 0;
            } else {
                reservation.refunded_solo_points = 0;
                reservation.refunded_team_points = 1;
            }
        } else if (!reservation.user_id) {
            console.log('No user_id associated with this reservation, skipping point refund');
        } else if (!refundPoints) {
            console.log('Point refund was not requested, skipping');
        }
        
        // Mark the reservation as cancelled in the database
        // You could either delete it, but it's often better to keep a record with a status
        await connection.execute(`
            UPDATE reservations 
            SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = 'admin' 
            WHERE id = ?
        `, [reservationId]);
        
        console.log(`Updated reservation ${reservationId} status to cancelled`);
        
        // Commit the transaction
        await connection.commit();
        connection.release();
        
        // Send success response
        res.json({ 
            message: 'Reservation cancelled successfully',
            reservation_id: reservationId,
            coach_id: reservation.coach_id,
            date: reservation.date,
            time: reservation.time,
            slot_id: reservation.availability_id,
            client_name: reservation.full_name,
            client_email: reservation.email,
            refunded_points: reservation.refunded_points || 0,
            refunded_solo_points: reservation.refunded_solo_points || 0,
            refunded_team_points: reservation.refunded_team_points || 0,
            updated_points: reservation.updated_points || null,
            updated_solo_points: reservation.updated_solo_points || null,
            updated_team_points: reservation.updated_team_points || null,
            reservation_type: reservation.reservation_type || 'individual'
        });
        
        // Optionally send notification emails asynchronously
        // This is moved after the response to avoid blocking
        setTimeout(async () => {
            try {
                // Get coach details for the email
                const [coachDetails] = await db.execute('SELECT name, email FROM coaches WHERE id = ?', [reservation.coach_id]);
                
                if (coachDetails.length > 0) {
                    const coach = coachDetails[0];
                    
                    // Here you could add code to send cancellation emails
                    console.log(`Would send cancellation email to coach (${coach.email}) and client (${reservation.email})`);
                }
            } catch (emailError) {
                console.error('Error sending cancellation emails:', emailError);
                // We don't want to fail the cancellation if emails fail
            }
        }, 0);
        
    } catch (error) {
        console.error('Error cancelling reservation:', error);
        
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('Error rolling back transaction:', rollbackError);
        }
        
        connection.release();
        
        res.status(500).json({ 
            error: 'Failed to cancel reservation',
            message: error.message
        });
    }
});

// Client cancel their own reservation (with 6-hour restriction)
router.post('/reservations/client/cancel/:id', async (req, res) => {
    console.log(`\n=== CLIENT CANCELLATION REQUEST FOR RESERVATION ID: ${req.params.id} ===`);
    
    // Get a connection from the pool for transaction
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const reservationId = req.params.id;
        const userId = req.body.user_id; // The user making the cancellation request
        
        console.log(`Processing client cancellation for reservation ${reservationId} by user ${userId}`);
        
        // First, get the reservation details with slot times
        const [reservationData] = await connection.execute(`
            SELECT r.*, ca.id as availability_id, ca.start_time, ca.end_time 
            FROM reservations r
            JOIN coach_availability ca ON r.coach_id = ca.coach_id AND r.date = ca.date AND r.time = ca.start_time
            WHERE r.id = ? AND r.user_id = ?
        `, [reservationId, userId]);
        
        if (reservationData.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Reservation not found or you do not have permission to cancel it' });
        }
        
        const reservation = reservationData[0];
        console.log(`Found reservation for ${reservation.full_name} on ${reservation.date} at ${reservation.time}`);
        
        // Check if the reservation is already cancelled
        if (reservation.status === 'cancelled') {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'This reservation is already cancelled' });
        }
        
        // Check if the reservation is in the past
        const now = new Date();
        const reservationDate = new Date(reservation.date);
        const [hours, minutes] = reservation.time.split(':').map(Number);
        reservationDate.setHours(hours, minutes, 0, 0);
        
        if (reservationDate < now) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ 
                error: 'Cannot cancel past reservations. The session has already occurred.'
            });
        }
        
        // Check if the reservation is within 6 hours (clients cannot cancel if less than 6 hours remain)
        const sixHoursInMilliseconds = 6 * 60 * 60 * 1000;
        const timeUntilReservation = reservationDate.getTime() - now.getTime();
        
        if (timeUntilReservation < sixHoursInMilliseconds) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ 
                error: 'Cannot cancel reservations within 6 hours of the scheduled time. Please contact an administrator if you need assistance.'
            });
        }
        
        // Check if the slot exists and is booked
        const [availabilityCheck] = await connection.execute(`
            SELECT is_booked, start_time, end_time FROM coach_availability 
            WHERE id = ?
        `, [reservation.availability_id]);
        
        if (availabilityCheck.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Availability slot not found' });
        }
        
        if (availabilityCheck[0].is_booked !== 1) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'This time slot is not currently booked' });
        }

        // Mark all overlapping slots as available again
        // For admin cancellations, pass isAdmin=true to handle past slots differently
        const freedSlotsCount = await freeOverlappingSlots(
            connection,
            reservation.coach_id,
            reservation.date,
            availabilityCheck[0].start_time,
            availabilityCheck[0].end_time,
            true // this is the admin cancellation endpoint
        );
        
        console.log(`Freed ${freedSlotsCount} overlapping availability slots`);
        
        console.log(`Marked availability slot ${reservation.availability_id} as available`);
        
        // Get current points for logging
        const [currentPoints] = await connection.execute('SELECT points, solo_points, team_points FROM users WHERE id = ?', [userId]);
        const beforePoints = currentPoints[0]?.points || 0;
        const beforeSoloPoints = currentPoints[0]?.solo_points || 0;
        const beforeTeamPoints = currentPoints[0]?.team_points || 0;
        
        // Check reservation type to determine which points to refund
        if (reservation.reservation_type === 'individual') {
            console.log(`Refunding 1 solo point to user ID: ${userId}. Current solo points: ${beforeSoloPoints}`);
            
            // Refund the solo point to the user
            await connection.execute(`
                UPDATE users 
                SET points = points + 1, solo_points = solo_points + 1 
                WHERE id = ?
            `, [userId]);
        } else if (reservation.reservation_type === 'group') {
            console.log(`Refunding 1 team point to user ID: ${userId}. Current team points: ${beforeTeamPoints}`);
            
            // Refund the team point to the user
            await connection.execute(`
                UPDATE users 
                SET points = points + 1, team_points = team_points + 1 
                WHERE id = ?
            `, [userId]);
        }
        
        console.log(`Point refund query executed for user ${userId}`);
        
        // Get updated points for response
        const [pointsResult] = await connection.execute('SELECT points, solo_points, team_points FROM users WHERE id = ?', [userId]);
        const afterPoints = pointsResult[0]?.points || 0;
        const afterSoloPoints = pointsResult[0]?.solo_points || 0;
        const afterTeamPoints = pointsResult[0]?.team_points || 0;
        
        console.log(`Points updated from ${beforePoints} to ${afterPoints} for user ${userId}`);
        console.log(`SoloPoints updated from ${beforeSoloPoints} to ${afterSoloPoints} for user ${userId}`);
        console.log(`TeamPoints updated from ${beforeTeamPoints} to ${afterTeamPoints} for user ${userId}`);
        
        // Mark the reservation as cancelled in the database
        await connection.execute(`
            UPDATE reservations 
            SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = 'client' 
            WHERE id = ?
        `, [reservationId]);
        
        console.log(`Updated reservation ${reservationId} status to cancelled`);
        
        // Commit the transaction
        await connection.commit();
        connection.release();
        
        // Send success response
        res.json({ 
            message: 'Reservation cancelled successfully',
            reservation_id: reservationId,
            coach_id: reservation.coach_id,
            date: reservation.date,
            time: reservation.time,
            slot_id: reservation.availability_id,
            client_name: reservation.full_name,
            client_email: reservation.email,
            refunded_points: 1,
            refunded_solo_points: reservation.reservation_type === 'individual' ? 1 : 0,
            refunded_team_points: reservation.reservation_type === 'group' ? 1 : 0,
            updated_points: afterPoints,
            updated_solo_points: afterSoloPoints,
            updated_team_points: afterTeamPoints,
            reservation_type: reservation.reservation_type || 'individual'
        });
        
    } catch (error) {
        console.error('Error cancelling reservation:', error);
        
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('Error rolling back transaction:', rollbackError);
        }
        
        connection.release();
        
        res.status(500).json({ 
            error: 'Failed to cancel reservation',
            message: error.message
        });
    }
});

// Get all reservations
// ... rest of the file remains unchanged

module.exports = router;
