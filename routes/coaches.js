const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../utils/authMiddleware');

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
        const sessionType = req.query.session_type || 'normal'; // Default to normal if not specified
        
        console.log(`\n=== AVAILABILITY ENDPOINT: Fetching AVAILABLE ${sessionType} slots for coach ${coachId} (client view) ===`);
        console.log(`🔍 DEBUG: Requested session_type parameter: "${req.query.session_type}"`);
        console.log(`🔍 DEBUG: Resolved sessionType variable: "${sessionType}"`);
        
        // Get the coach name for better logging
        const [coach] = await db.execute('SELECT name FROM coaches WHERE id = ?', [coachId]);
        const coachName = coach.length > 0 ? coach[0].name : 'Unknown Coach';
        
        console.log(`Coach: ${coachName} (ID: ${coachId}), Session Type: ${sessionType}`);
        
        // Get current date and time
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
        const currentTime = now.toTimeString().split(' ')[0].substring(0, 8); // HH:MM:SS
        
        console.log(`Current date: ${currentDate}, Current time: ${currentTime}`);
        
        // Only show available slots that are in the future (not in the past) and match the session type
        // Filter out slots that are on past dates OR on today but past the current time
        const [availability] = await db.execute(`
            SELECT 
                ca.id, 
                ca.coach_id, 
                ca.date, 
                ca.start_time, 
                ca.end_time, 
                ca.status,
                ca.session_type,
                ca.duration,
                c.name
            FROM coach_availability ca
            JOIN coaches c ON ca.coach_id = c.id
            WHERE ca.coach_id = ? 
            AND ca.status = 'available'
            AND ca.session_type = ?
            AND (
                ca.date > ? 
                OR (ca.date = ? AND ca.start_time > ?)
            )
            ORDER BY ca.date, ca.start_time
        `, [coachId, sessionType, currentDate, currentDate, currentTime]);
        
        console.log(`Found ${availability.length} available future ${sessionType} slots for coach ${coachId} (filtered past slots)`);
        
        if (availability.length === 0) {
            console.log(`No available future ${sessionType} time slots found for this coach`);
        } else {
            console.log(`Available future ${sessionType} slots for this coach:`);
            availability.forEach(slot => {
                console.log(`- ${slot.date} ${slot.start_time}-${slot.end_time} (${slot.session_type}, ${slot.duration}min, ID: ${slot.id})`);
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
                ca.status,
                ca.duration,
                ca.session_type,
                ca.is_free,
                CASE 
                    WHEN ca.date < ? THEN 1
                    WHEN ca.date = ? AND ca.start_time < ? THEN 1
                    ELSE 0
                END as is_past
            FROM coach_availability ca
            WHERE ca.coach_id = ? 
            ORDER BY ca.date, ca.start_time, ca.session_type
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

// Add availability for a coach - supports both normal and bilan sessions
router.post('/:id/availability', async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        const coachId = req.params.id;
        const { date, start_time, end_time, session_types = ['normal', 'bilan'] } = req.body;
        
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

        // First, verify that the coach exists
        const [coachCheck] = await connection.execute(
            'SELECT id, name FROM coaches WHERE id = ?',
            [coachId]
        );

        if (coachCheck.length === 0) {
            connection.release();
            return res.status(404).json({ 
                error: `Coach with ID ${coachId} not found. Please select a valid coach.` 
            });
        }

        console.log(`Coach verified: ${coachCheck[0].name} (ID: ${coachId})`);

        const slots = [];
        const startDateTime = new Date(`${date}T${start_time}`);
        const endDateTime = new Date(`${date}T${end_time}`);

        console.log(`\n=== CREATING TIME SLOTS FOR COACH ${coachId} ===`);
        console.log(`Date: ${date}, Time: ${start_time} - ${end_time}`);
        console.log(`Session types: ${session_types.join(', ')}`);

        // Generate normal slots (55 minutes) if requested
        if (session_types.includes('normal')) {
            console.log('Generating normal (55min) slots...');
            let currentSlot = new Date(startDateTime);
            while (currentSlot < endDateTime) {
                const potentialEndSlot = new Date(currentSlot.getTime() + 55 * 60000); // 55 minutes
                
                // Only add the slot if it ends before or at the specified end time
                if (potentialEndSlot <= endDateTime) {
                    const slotStart = currentSlot.toTimeString().slice(0, 8);
                    const slotEnd = potentialEndSlot.toTimeString().slice(0, 8);

                    slots.push({
                        start: slotStart,
                        end: slotEnd,
                        session_type: 'normal',
                        duration: 55,
                        isDerived: currentSlot.getMinutes() === 30 // Half-hour start = derived
                    });
                }

                // Move to next 30 minutes (allows both X:00 and X:30 starts)
                currentSlot.setMinutes(currentSlot.getMinutes() + 30);
            }
        }

        // Generate bilan slots (30 minutes) if requested
        if (session_types.includes('bilan')) {
            console.log('Generating bilan (30min) slots...');
            let currentSlot = new Date(startDateTime);
            while (currentSlot < endDateTime) {
                const potentialEndSlot = new Date(currentSlot.getTime() + 30 * 60000); // 30 minutes
                
                // Only add the slot if it ends before or at the specified end time
                if (potentialEndSlot <= endDateTime) {
                    const slotStart = currentSlot.toTimeString().slice(0, 8);
                    const slotEnd = potentialEndSlot.toTimeString().slice(0, 8);

                    slots.push({
                        start: slotStart,
                        end: slotEnd,
                        session_type: 'bilan',
                        duration: 30,
                        isDerived: false // Bilan slots are not derived, they're primary
                    });
                }

                // Move to next 30 minutes
                currentSlot.setMinutes(currentSlot.getMinutes() + 30);
            }
        }

        console.log(`Generated ${slots.length} total slots`);

        // Insert all slots
        const createdSlots = [];
        for (const slot of slots) {
            // Check if slot already exists
            const [existingSlot] = await connection.execute(
                'SELECT id FROM coach_availability WHERE coach_id = ? AND date = ? AND start_time = ? AND end_time = ? AND session_type = ?',
                [coachId, date, slot.start, slot.end, slot.session_type]
            );
            
            if (existingSlot.length === 0) {
                const [result] = await connection.execute(
                    'INSERT INTO coach_availability (coach_id, date, start_time, end_time, duration, is_derived, session_type, is_free) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [coachId, date, slot.start, slot.end, slot.duration, slot.isDerived, slot.session_type, slot.session_type === 'bilan']
                );

                createdSlots.push({ 
                    id: result.insertId,
                    coach_id: parseInt(coachId),
                    date,
                    start_time: slot.start,
                    end_time: slot.end,
                    is_booked: 0,
                    is_derived: slot.isDerived,
                    duration: slot.duration,
                    session_type: slot.session_type
                });
                
                console.log(`Created ${slot.session_type} slot: ${slot.start}-${slot.end}`);
            } else {
                console.log(`Skipped existing ${slot.session_type} slot: ${slot.start}-${slot.end}`);
            }
        }

        await connection.commit();
        connection.release();
        
        console.log(`=== FINISHED CREATING ${createdSlots.length} NEW TIME SLOTS ===\n`);
        res.status(201).json(createdSlots);
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Error during rollback:', rollbackError);
            }
            connection.release();
        }
        console.error('Error adding availability:', error);
        console.error('Error stack:', error.stack);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sqlMessage: error.sqlMessage
        });
        res.status(500).json({ 
            error: 'Failed to add availability',
            details: error.message,
            sqlError: error.sqlMessage
        });
    }
});

// Delete coach availability
router.delete('/availability/:id', isAuthenticated, isAdmin, async (req, res) => {
    let connection;
    
    try {
        const availabilityId = req.params.id;
        console.log(`Attempting to delete single availability slot: ${availabilityId}`);
        
        connection = await db.getConnection();
        
        // Try a fast delete with a very short timeout
        let deleteResult;
        try {
            // Set a shorter lock timeout for this specific query (2 seconds)
            await connection.execute('SET SESSION innodb_lock_wait_timeout = 2');
            
            deleteResult = await connection.execute(
                'DELETE FROM coach_availability WHERE id = ? AND status = \'available\'',
                [availabilityId]
            );
            
            // Reset to default timeout
            await connection.execute('SET SESSION innodb_lock_wait_timeout = 50');
            
        } catch (lockError) {
            // Reset timeout even on error
            await connection.execute('SET SESSION innodb_lock_wait_timeout = 50');
            
            if (lockError.code === 'ER_LOCK_WAIT_TIMEOUT') {
                console.log(`Slot ${availabilityId} is locked, attempting force unlock...`);
                
                // Try to identify if this is a stuck transaction and provide better feedback
                return res.status(503).json({ 
                    error: 'This slot appears to be locked by another operation. Please try again in a few minutes or contact an administrator.',
                    slotId: availabilityId,
                    code: 'SLOT_LOCKED'
                });
            }
            throw lockError;
        }
        
        const [result] = deleteResult;
        
        if (result.affectedRows === 0) {
            // Only check why it failed if the delete didn't work
            const [checkSlot] = await connection.execute(
                'SELECT status FROM coach_availability WHERE id = ?',
                [availabilityId]
            );
            
            if (checkSlot.length === 0) {
                return res.status(404).json({ error: 'Availability slot not found' });
            } else if (checkSlot[0].status === 'booked' || checkSlot[0].status === 'overlapping') {
                return res.status(400).json({ error: 'Cannot delete a booked or overlapping slot' });
            }
        }
        
        console.log(`Successfully deleted availability slot ${availabilityId}`);
        res.json({ message: 'Availability slot deleted successfully' });
        
    } catch (error) {
        console.error('Error deleting availability:', error);
        
        // Provide more specific error messaging
        if (error.code === 'ER_LOCK_WAIT_TIMEOUT') {
            res.status(503).json({ 
                error: 'Database is busy, please try again in a moment',
                message: 'Lock timeout occurred',
                slotId: req.params.id
            });
        } else {
            res.status(500).json({ 
                error: 'Failed to delete availability',
                message: error.message
            });
        }
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Bulk delete coach availability  
router.post('/availability/bulk-delete', isAuthenticated, isAdmin, async (req, res) => {
    let connection;
    
    try {
        const { ids } = req.body;
        
        // Validate input
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty IDs array' });
        }
        
        // Convert IDs to numbers for safety
        const slotIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id));
        
        if (slotIds.length === 0) {
            return res.status(400).json({ error: 'No valid IDs provided' });
        }

        console.log(`Attempting to bulk delete ${slotIds.length} availability slots: ${slotIds.join(', ')}`);
        
        connection = await db.getConnection();
        
        // Set a shorter lock timeout to avoid getting stuck
        await connection.execute('SET SESSION innodb_lock_wait_timeout = 3');
        
        try {
            // Try batch delete first
            const placeholders = slotIds.map(() => '?').join(',');
            const [result] = await connection.execute(
                `DELETE FROM coach_availability WHERE id IN (${placeholders}) AND status = 'available'`,
                slotIds
            );
            
            const totalDeleted = result.affectedRows;
            console.log(`Batch deleted ${totalDeleted} slots out of ${slotIds.length} requested`);
            
            // Reset timeout
            await connection.execute('SET SESSION innodb_lock_wait_timeout = 50');
            
            // Calculate failed deletions
            const failedCount = slotIds.length - totalDeleted;
            
            if (failedCount > 0) {
                res.status(207).json({ // 207 Multi-Status
                    message: `Partially completed: ${totalDeleted} slots deleted, ${failedCount} failed (may be booked or not found)`,
                    deletedCount: totalDeleted,
                    failedCount: failedCount,
                    totalRequested: slotIds.length
                });
            } else {
                res.json({ 
                    message: `Successfully deleted ${totalDeleted} availability slots`,
                    deletedCount: totalDeleted
                });
            }
            
        } catch (batchError) {
            // Reset timeout even on error
            await connection.execute('SET SESSION innodb_lock_wait_timeout = 50');
            
            if (batchError.code === 'ER_LOCK_WAIT_TIMEOUT') {
                console.log('Batch delete failed due to lock timeout, falling back to individual deletions...');
                
                // Fall back to individual deletions with very short timeout
                await connection.execute('SET SESSION innodb_lock_wait_timeout = 2');
                
                let totalDeleted = 0;
                let lockedSlots = [];
                let bookedOrNotFoundSlots = [];
                
                for (const slotId of slotIds) {
                    try {
                        const [result] = await connection.execute(
                            'DELETE FROM coach_availability WHERE id = ? AND status = \'available\'',
                            [slotId]
                        );
                        
                        if (result.affectedRows > 0) {
                            totalDeleted++;
                            console.log(`Deleted slot ${slotId} (${totalDeleted}/${slotIds.length})`);
                        } else {
                            bookedOrNotFoundSlots.push(slotId);
                        }
                        
                    } catch (slotError) {
                        if (slotError.code === 'ER_LOCK_WAIT_TIMEOUT') {
                            console.log(`Slot ${slotId} is locked, skipping...`);
                            lockedSlots.push(slotId);
                        } else {
                            console.error(`Error deleting slot ${slotId}:`, slotError.message);
                            bookedOrNotFoundSlots.push(slotId);
                        }
                    }
                }
                
                // Reset timeout
                await connection.execute('SET SESSION innodb_lock_wait_timeout = 50');
                
                console.log(`Individual delete completed: ${totalDeleted} deleted, ${lockedSlots.length} locked, ${bookedOrNotFoundSlots.length} booked/not found`);
                
                // Build response
                let message = `Completed with individual deletions: ${totalDeleted} deleted`;
                const responseData = {
                    deletedCount: totalDeleted,
                    totalRequested: slotIds.length,
                    usedFallbackMethod: true
                };
                
                if (lockedSlots.length > 0) {
                    message += `, ${lockedSlots.length} locked (try again later)`;
                    responseData.lockedSlots = lockedSlots;
                }
                
                if (bookedOrNotFoundSlots.length > 0) {
                    message += `, ${bookedOrNotFoundSlots.length} booked/not found`;
                    responseData.failedSlots = bookedOrNotFoundSlots;
                }
                
                responseData.message = message;
                
                res.status(totalDeleted > 0 ? 207 : 503).json(responseData);
                
            } else {
                throw batchError;
            }
        }
        
    } catch (error) {
        console.error('Error bulk deleting availability:', error);
        
        // Always reset timeout on any error
        if (connection) {
            try {
                await connection.execute('SET SESSION innodb_lock_wait_timeout = 50');
            } catch (resetError) {
                console.error('Error resetting timeout:', resetError);
            }
        }
        
        // Provide more specific error messaging
        if (error.code === 'ER_LOCK_WAIT_TIMEOUT') {
            res.status(503).json({ 
                error: 'Database is busy, please try again in a moment',
                message: 'Lock timeout occurred during bulk delete'
            });
        } else {
            res.status(500).json({ 
                error: 'Failed to bulk delete availability',
                message: error.message
            });
        }
    } finally {
        if (connection) {
            connection.release();
        }
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

// Bulk create availability for multiple days/weeks
router.post('/bulk-availability', async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        const { 
            coach_id, 
            start_date, 
            end_date, 
            start_time, 
            end_time, 
            days_of_week, 
            repeat_for_weeks,
            session_types = ['normal'] // Default to normal if not provided
        } = req.body;
        
        // Validate required fields
        if (!coach_id || !start_date || !end_date || !start_time || !end_time || !days_of_week || days_of_week.length === 0) {
            connection.release();
            return res.status(400).json({ 
                error: 'Coach ID, date range, time range, and days of week are required' 
            });
        }
        
        // Validate session_types
        if (!session_types || session_types.length === 0) {
            connection.release();
            return res.status(400).json({ 
                error: 'At least one session type must be selected' 
            });
        }
        
        const validSessionTypes = ['normal', 'bilan'];
        const invalidTypes = session_types.filter(type => !validSessionTypes.includes(type));
        if (invalidTypes.length > 0) {
            connection.release();
            return res.status(400).json({ 
                error: `Invalid session types: ${invalidTypes.join(', ')}. Valid types are: ${validSessionTypes.join(', ')}` 
            });
        }
        
        // Validate that end_date is after start_date
        if (new Date(end_date) < new Date(start_date)) {
            connection.release();
            return res.status(400).json({ 
                error: 'End date must be after start date' 
            });
        }
        
        // Check if dates are in the past
        const now = new Date();
        const currentDateStr = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().split(' ')[0].substring(0, 8);
        
        if (start_date < currentDateStr) {
            connection.release();
            return res.status(400).json({ 
                error: 'Cannot create availability in the past. Please select future dates.'
            });
        }

        await connection.beginTransaction();

        const createdSlots = [];
        
        // Calculate the end date based on repeat_for_weeks
        const startDateObj = new Date(start_date);
        const endDateObj = new Date(end_date);
        const finalEndDate = new Date(startDateObj);
        finalEndDate.setDate(finalEndDate.getDate() + (repeat_for_weeks * 7));
        
        // Use the smaller of the provided end_date or calculated final end date
        const actualEndDate = endDateObj < finalEndDate ? endDateObj : finalEndDate;
        
        console.log(`Creating slots for session types: ${session_types.join(', ')}`);
        
        // Iterate through each day in the date range
        let iterationDate = new Date(startDateObj);
        
        while (iterationDate <= actualEndDate) {
            const dayOfWeek = iterationDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
            
            // Check if this day is in our selected days_of_week
            if (days_of_week.includes(dayOfWeek)) {
                const dateStr = iterationDate.toISOString().split('T')[0];
                
                // Skip if this date is in the past
                if (dateStr >= currentDateStr || (dateStr === currentDateStr && start_time >= currentTime)) {
                    
                    // Create slots for each session type
                    for (const sessionType of session_types) {
                        console.log(`Generating ${sessionType} slots for ${dateStr}`);
                        
                        // Generate time slots using the generateTimeSlots function
                        const { generateTimeSlots } = require('../utils/availabilityHelpers');
                        const generatedSlots = generateTimeSlots(start_time, end_time, sessionType);
                        
                        // Insert all slots for this day and session type
                        for (const slot of generatedSlots) {
                            // Check if slot already exists
                            const [existingSlot] = await connection.execute(
                                'SELECT id FROM coach_availability WHERE coach_id = ? AND date = ? AND start_time = ? AND end_time = ? AND session_type = ?',
                                [coach_id, dateStr, slot.start_time, slot.end_time, sessionType]
                            );
                            
                            if (existingSlot.length === 0) {
                                const [result] = await connection.execute(
                                    'INSERT INTO coach_availability (coach_id, date, start_time, end_time, duration, session_type, is_free) VALUES (?, ?, ?, ?, ?, ?, ?)',
                                    [coach_id, dateStr, slot.start_time, slot.end_time, slot.duration, sessionType, sessionType === 'bilan']
                                );

                                createdSlots.push({ 
                                    id: result.insertId,
                                    coach_id: parseInt(coach_id),
                                    date: dateStr,
                                    start_time: slot.start_time,
                                    end_time: slot.end_time,
                                    is_booked: 0,
                                    session_type: sessionType,
                                    duration: slot.duration,
                                    is_free: sessionType === 'bilan'
                                });
                            }
                        }
                    }
                }
            }
            
            // Move to next day
            iterationDate.setDate(iterationDate.getDate() + 1);
        }

        await connection.commit();
        connection.release();
        
        console.log(`Bulk availability created: ${createdSlots.length} slots for coach ${coach_id} (Session types: ${session_types.join(', ')})`);
        res.status(201).json(createdSlots);
        
    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('Error during rollback:', rollbackError);
        }
        console.error('Error creating bulk availability:', error);
        res.status(500).json({ 
            error: 'Failed to create bulk availability',
            message: error.message 
        });
    } finally {
        connection.release();
    }
});

module.exports = router;