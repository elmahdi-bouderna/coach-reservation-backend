const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Get all coaches
router.get('/', async (req, res) => {
    try {
        const [coaches] = await db.execute(`
            SELECT c.*, u.email, u.matricule, u.username 
            FROM coaches c
            LEFT JOIN users u ON c.user_id = u.id
            ORDER BY c.name
        `);
        console.log(`Found ${coaches.length} coaches`);
        res.json(coaches);
    } catch (error) {
        console.error('Error fetching coaches:', error);
        res.status(500).json({ error: 'Failed to fetch coaches' });
    }
});

// Get coach availability - MariaDB Compatible
router.get('/:id/availability', async (req, res) => {
    try {
        const coachId = req.params.id;
        console.log(`\n=== AVAILABILITY ENDPOINT: Fetching AVAILABLE slots for coach ${coachId} (client view) ===`);
        
        // Get the coach name for better logging
        const [coach] = await db.execute('SELECT name FROM coaches WHERE id = ?', [coachId]);
        const coachName = coach.length > 0 ? coach[0].name : 'Unknown Coach';
        
        console.log(`Coach: ${coachName} (ID: ${coachId})`);
        
        // Get current date and time
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
        const currentTime = now.toTimeString().split(' ')[0].substring(0, 8); // HH:MM:SS
        
        console.log(`Current date: ${currentDate}, Current time: ${currentTime}`);
        
        // Only show available slots that are in the future (not in the past)
        // Filter out slots that are on past dates OR on today but past the current time
        const [availability] = await db.execute(`
            SELECT 
                ca.id, 
                ca.coach_id, 
                ca.date, 
                ca.start_time, 
                ca.end_time, 
                ca.is_booked, 
                c.name
            FROM coach_availability ca
            JOIN coaches c ON ca.coach_id = c.id
            WHERE ca.coach_id = ? 
            AND ca.is_booked = 0
            AND (
                ca.date > ? 
                OR (ca.date = ? AND ca.start_time > ?)
            )
            ORDER BY ca.date, ca.start_time
        `, [coachId, currentDate, currentDate, currentTime]);
        
        console.log(`Found ${availability.length} available future slots for coach ${coachId} (filtered past slots)`);
        
        if (availability.length === 0) {
            console.log('No available future time slots found for this coach');
        } else {
            console.log('Available future slots for this coach:');
            availability.forEach(slot => {
                console.log(`- ${slot.date} ${slot.start_time}-${slot.end_time} (ID: ${slot.id})`);
            });
        }
        
        console.log('=== End availability fetch ===\n');
        
        res.json(availability);
    } catch (error) {
        console.error('Error fetching availability:', error);
        res.status(500).json({ error: 'Failed to fetch availability' });
    }
});

// Get all availability for a coach (including booked slots) - for admin
router.get('/:id/all-availability', async (req, res) => {
    try {
        const coachId = req.params.id;
        
        console.log(`\n=== ADMIN ENDPOINT: Fetching ALL availability for coach ${coachId} ===`);
        
        // Get current date and time for checking past slots
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
        const currentTime = now.toTimeString().split(' ')[0].substring(0, 8); // HH:MM:SS
        
        console.log(`Current date: ${currentDate}, Current time: ${currentTime}`);
        
        // Get all slots but add a "is_past" flag for proper comparison
        const [availability] = await db.execute(`
            SELECT 
                ca.id, 
                ca.coach_id, 
                ca.date, 
                ca.start_time, 
                ca.end_time, 
                ca.is_booked,
                CASE 
                    WHEN ca.date < ? THEN 1
                    WHEN ca.date = ? AND ca.start_time < ? THEN 1
                    ELSE 0
                END as is_past
            FROM coach_availability ca
            WHERE ca.coach_id = ? 
            ORDER BY ca.date, ca.start_time
        `, [currentDate, currentDate, currentTime, coachId]);
        
        console.log(`Found ${availability.length} total slots for coach ${coachId} (no date filtering)`);
        
        if (availability.length > 0) {
            console.log('First slot:', JSON.stringify(availability[0], null, 2));
        }
        
        console.log('=== End all availability fetch ===\n');
        
        res.json(availability);
    } catch (error) {
        console.error('Error fetching all availability:', error);
        res.status(500).json({ error: 'Failed to fetch all availability' });
    }
});

// Add a new coach
router.post('/', async (req, res) => {
    // Get a connection from the pool for transaction
    const connection = await db.getConnection();
    
    try {
        const { name, bio, specialty, photo, email, matricule, password } = req.body;
        
        // Validate required fields
        if (!name || !specialty) {
            connection.release();
            return res.status(400).json({ error: 'Name and specialty are required' });
        }
        
        // Default photo if not provided
        const coachPhoto = photo || 'https://via.placeholder.com/150x150?text=Coach';
        
        // Start a transaction to ensure data consistency
        await connection.beginTransaction();
        
        // Generate matricule if not provided
        let coachMatricule = matricule;
        if (!coachMatricule) {
            // Use the backend function instead of SQL function
            const { generateMatricule } = require('../utils/matriculeGenerator');
            coachMatricule = generateMatricule();
        }
        
        // Email is required
        let coachEmail = email;
        if (!coachEmail) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Password is required
        let coachPassword = password;
        if (!coachPassword) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'Password is required' });
        }
        
        // Check if email already exists
        const [existingEmails] = await connection.execute('SELECT id FROM users WHERE email = ?', [coachEmail]);
        if (existingEmails.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'Email already exists' });
        }
        
        // Check if matricule already exists
        const [existingMatricules] = await connection.execute('SELECT id FROM users WHERE matricule = ?', [coachMatricule]);
        if (existingMatricules.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'Matricule already exists' });
        }
        
        // Hash password
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(coachPassword, 10);
        
        // Create user for coach
        const [userResult] = await connection.execute(
            'INSERT INTO users (matricule, username, password, email, role) VALUES (?, ?, ?, ?, ?)',
            [coachMatricule, name, hashedPassword, coachEmail, 'coach']
        );
        
        // Create coach entry and link to user
        const [coachResult] = await connection.execute(
            'INSERT INTO coaches (name, bio, specialty, photo, email, matricule, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, bio, specialty, coachPhoto, coachEmail, coachMatricule, userResult.insertId]
        );
        
        // Commit the transaction
        await connection.commit();
        
        res.status(201).json({ 
            id: coachResult.insertId, 
            name, 
            bio, 
            specialty, 
            photo: coachPhoto,
            email: coachEmail,
            matricule: coachMatricule,
            user_id: userResult.insertId
        });
    } catch (error) {
        // Rollback transaction on error
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('Error during rollback:', rollbackError);
        }
        console.error('Error adding coach:', error);
        res.status(500).json({ error: 'Failed to add coach', message: error.message });
    } finally {
        // Always release the connection
        connection.release();
    }
});

// Add availability for a coach
router.post('/:id/availability', async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        const coachId = req.params.id;
        const { date, start_time, end_time } = req.body;
        
        // Validate required fields
        if (!date || !start_time || !end_time) {
            connection.release();
            return res.status(400).json({ error: 'Date, start time, and end time are required' });
        }
        
        // Check if the slot is in the past
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const currentTime = now.toTimeString().split(' ')[0].substring(0, 8); // HH:MM:SS
        
        if (date < currentDate || (date === currentDate && start_time < currentTime)) {
            connection.release();
            return res.status(400).json({ 
                error: 'Cannot add availability in the past. Please select a future date and time.'
            });
        }

        await connection.beginTransaction();

        const slots = [];
        const startDateTime = new Date(`${date}T${start_time}`);
        const endDateTime = new Date(`${date}T${end_time}`);
        const SLOT_DURATION = 55; // minutes

        // Generate regular slots (starting on the hour)
        let currentSlot = new Date(startDateTime);
        while (currentSlot < endDateTime) {
            const potentialEndSlot = new Date(currentSlot.getTime() + SLOT_DURATION * 60000);
            // Only add the slot if it ends before or at the specified end time
            if (potentialEndSlot <= endDateTime) {
                const slotStart = currentSlot.toTimeString().slice(0, 8);
                const slotEnd = potentialEndSlot.toTimeString().slice(0, 8);

                slots.push({
                    start: slotStart,
                    end: slotEnd,
                    isDerived: false
                });
            }

            // Move to next hour
            currentSlot.setHours(currentSlot.getHours() + 1);
            currentSlot.setMinutes(0);
        }

        // Generate half-hour slots
        currentSlot = new Date(startDateTime);
        currentSlot.setMinutes(30); // Start at half past
        while (currentSlot < endDateTime) {
            const potentialEndSlot = new Date(currentSlot.getTime() + SLOT_DURATION * 60000);
            // Only add the slot if it ends before or at the specified end time
            if (potentialEndSlot <= endDateTime) {
                const slotStart = currentSlot.toTimeString().slice(0, 8);
                const slotEnd = potentialEndSlot.toTimeString().slice(0, 8);

                slots.push({
                    start: slotStart,
                    end: slotEnd,
                    isDerived: true
                });
            }

            // Move to next hour
            currentSlot.setHours(currentSlot.getHours() + 1);
            currentSlot.setMinutes(30);
        }

        // Insert all slots
        const createdSlots = [];
        for (const slot of slots) {
            const [result] = await connection.execute(
                'INSERT INTO coach_availability (coach_id, date, start_time, end_time, duration, is_derived) VALUES (?, ?, ?, ?, ?, ?)',
                [coachId, date, slot.start, slot.end, SLOT_DURATION, slot.isDerived]
            );

            createdSlots.push({ 
                id: result.insertId,
                coach_id: coachId,
                date,
                start_time: slot.start,
                end_time: slot.end,
                is_booked: 0,
                is_derived: slot.isDerived,
                duration: SLOT_DURATION
            });
        }

        await connection.commit();
        connection.release();
        
        res.status(201).json(createdSlots);
    } catch (error) {
        console.error('Error adding availability:', error);
        res.status(500).json({ error: 'Failed to add availability' });
    }
});

// Delete coach availability
router.delete('/availability/:id', async (req, res) => {
    try {
        const availabilityId = req.params.id;
        
        // Check if the slot is booked
        const [checkBooked] = await db.execute(
            'SELECT is_booked FROM coach_availability WHERE id = ?',
            [availabilityId]
        );
        
        if (checkBooked.length === 0) {
            return res.status(404).json({ error: 'Availability slot not found' });
        }
        
        if (checkBooked[0].is_booked) {
            return res.status(400).json({ error: 'Cannot delete a booked slot' });
        }
        
        await db.execute('DELETE FROM coach_availability WHERE id = ?', [availabilityId]);
        
        res.json({ message: 'Availability slot deleted successfully' });
    } catch (error) {
        console.error('Error deleting availability:', error);
        res.status(500).json({ 
            error: 'Failed to delete availability',
            message: error.message
        });
    }
});

// Update a coach
router.put('/:id', async (req, res) => {
    // Get a connection from the pool for transaction
    const connection = await db.getConnection();
    
    try {
        const coachId = req.params.id;
        const { name, bio, specialty, photo, email, matricule, password, updateCredentials } = req.body;
        
        // Validate required fields
        if (!name || !specialty) {
            connection.release();
            return res.status(400).json({ error: 'Name and specialty are required' });
        }
        
        // Default photo if not provided
        const coachPhoto = photo || 'https://via.placeholder.com/150x150?text=Coach';
        
        // Start a transaction
        await connection.beginTransaction();
        
        // Get current coach data to compare changes
        const [coaches] = await connection.execute('SELECT * FROM coaches WHERE id = ?', [coachId]);
        
        if (coaches.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Coach not found' });
        }
        
        const coach = coaches[0];
        
        // Update coach record
        await connection.execute(
            'UPDATE coaches SET name = ?, bio = ?, specialty = ?, photo = ? WHERE id = ?',
            [name, bio, specialty, coachPhoto, coachId]
        );
        
        // If we need to update credentials and coach has a user_id
        if (updateCredentials && coach.user_id) {
            let updates = [];
            let params = [];
            
            // Build update query based on provided fields
            if (name) {
                updates.push('username = ?');
                params.push(name);
            }
            
            if (email && email !== coach.email) {
                // Check if email is already in use
                const [existingEmails] = await connection.execute(
                    'SELECT id FROM users WHERE email = ? AND id != ?', 
                    [email, coach.user_id]
                );
                
                if (existingEmails.length > 0) {
                    await connection.rollback();
                    connection.release();
                    return res.status(400).json({ error: 'Email already exists' });
                }
                
                updates.push('email = ?');
                params.push(email);
                
                // Also update coach table email
                await connection.execute('UPDATE coaches SET email = ? WHERE id = ?', [email, coachId]);
            }
            
            if (matricule && matricule !== coach.matricule) {
                // Check if matricule is already in use
                const [existingMatricules] = await connection.execute(
                    'SELECT id FROM users WHERE matricule = ? AND id != ?', 
                    [matricule, coach.user_id]
                );
                
                if (existingMatricules.length > 0) {
                    await connection.rollback();
                    connection.release();
                    return res.status(400).json({ error: 'Matricule already exists' });
                }
                
                updates.push('matricule = ?');
                params.push(matricule);
                
                // Also update coach table matricule
                await connection.execute('UPDATE coaches SET matricule = ? WHERE id = ?', [matricule, coachId]);
            }
            
            if (password) {
                const bcrypt = require('bcrypt');
                const hashedPassword = await bcrypt.hash(password, 10);
                updates.push('password = ?');
                params.push(hashedPassword);
            }
            
            // If we have updates, apply them to user record
            if (updates.length > 0) {
                params.push(coach.user_id);
                await connection.execute(
                    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
                    params
                );
            }
        }
        
        // Commit transaction
        await connection.commit();
        
        // Get updated coach
        const [updatedCoaches] = await connection.execute('SELECT * FROM coaches WHERE id = ?', [coachId]);
        
        res.json(updatedCoaches[0]);
    } catch (error) {
        // Rollback on error
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('Error during rollback:', rollbackError);
        }
        console.error('Error updating coach:', error);
        res.status(500).json({ 
            error: 'Failed to update coach', 
            message: error.message,
            code: error.code,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage
        });
    } finally {
        // Always release the connection
        connection.release();
    }
});

// Delete coach and related records
router.delete('/:id', async (req, res) => {
    // Get a connection from the pool for transaction
    const connection = await db.getConnection();
    
    try {
        const coachId = req.params.id;
        console.log(`Attempting to delete coach with ID: ${coachId}`);
        
        // Start a transaction
        await connection.beginTransaction();
        console.log('Transaction started');
        
        try {
            // Get coach data to find associated user
            console.log(`Fetching coach data for ID: ${coachId}`);
            const [coaches] = await connection.execute('SELECT * FROM coaches WHERE id = ?', [coachId]);
            
            if (coaches.length === 0) {
                console.log('Coach not found, rolling back transaction');
                await connection.rollback();
                connection.release();
                return res.status(404).json({ error: 'Coach not found' });
            }
            
            const coach = coaches[0];
            console.log(`Found coach: ${JSON.stringify(coach)}`);
            
            // Delete coach availability first (cascade would handle this, but being explicit)
            console.log(`Deleting coach availability for coach ID: ${coachId}`);
            const [availabilityResult] = await connection.execute('DELETE FROM coach_availability WHERE coach_id = ?', [coachId]);
            console.log(`Deleted ${availabilityResult.affectedRows} availability records`);
            
            // Delete reservations for this coach (cascade would handle this, but being explicit)
            console.log(`Deleting reservations for coach ID: ${coachId}`);
            const [reservationsResult] = await connection.execute('DELETE FROM reservations WHERE coach_id = ?', [coachId]);
            console.log(`Deleted ${reservationsResult.affectedRows} reservation records`);
            
            // Delete the coach
            console.log(`Deleting coach with ID: ${coachId}`);
            const [coachResult] = await connection.execute('DELETE FROM coaches WHERE id = ?', [coachId]);
            console.log(`Deleted coach: ${coachResult.affectedRows} row(s) affected`);
            
            // If coach had a user account, delete that too
            if (coach.user_id) {
                console.log(`Deleting associated user account with ID: ${coach.user_id}`);
                const [userResult] = await connection.execute('DELETE FROM users WHERE id = ?', [coach.user_id]);
                console.log(`Deleted user: ${userResult.affectedRows} row(s) affected`);
            } else {
                console.log('No associated user account found for this coach');
            }
            
            // Commit the transaction
            console.log('All deletions successful, committing transaction');
            await connection.commit();
            
            console.log('Coach and related records deleted successfully');
            res.json({ message: 'Coach deleted successfully', coachId });
        } catch (error) {
            // If any error occurs, rollback the transaction
            console.error('Error during deletion, rolling back transaction:', error);
            await connection.rollback();
            throw error;
        } finally {
            // Always release the connection back to the pool
            connection.release();
        }
    } catch (error) {
        console.error('Error deleting coach:', error);
        // Include more detailed error information in response
        res.status(500).json({ 
            error: 'Failed to delete coach',
            message: error.message,
            code: error.code,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage
        });
    }
});

module.exports = router;