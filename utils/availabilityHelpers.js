const db = require('../config/database');

// Helper function to check if two time periods overlap
function doPeriodsOverlap(start1, end1, start2, end2) {
    return start1 < end2 && start2 < end1;
}

// Function to mark overlapping slots as unavailable when a reservation is made
// This handles both normal (55 min) and bilan (25 min) sessions
async function markOverlappingSlots(connection, coachId, date, startTime, endTime, reservationId = null) {
    try {
        console.log(`\n=== MARKING OVERLAPPING SLOTS ===`);
        console.log(`Coach ID: ${coachId}, Date: ${date}`);
        console.log(`Reservation time: ${startTime} - ${endTime}`);

        // Get the start and end times as Date objects for comparison
        const reservationStart = new Date(`${date}T${startTime}`);
        const reservationEnd = new Date(`${date}T${endTime}`);

        // Find all slots on the same date that overlap with the reservation
        // Two time periods overlap if: start1 < end2 AND start2 < end1
        // Where period1 is the reservation and period2 is each slot
        const [overlappingSlots] = await connection.execute(`
            SELECT id, start_time, end_time, session_type, duration
            FROM coach_availability 
            WHERE coach_id = ? 
            AND date = ? 
            AND is_booked = 0
            AND start_time < ?
            AND end_time > ?
        `, [
            coachId, 
            date, 
            endTime,   // Reservation end time
            startTime  // Reservation start time
        ]);

        console.log(`Found ${overlappingSlots.length} overlapping slots:`);
        overlappingSlots.forEach(slot => {
            console.log(`- Slot ID ${slot.id}: ${slot.start_time}-${slot.end_time} (${slot.session_type}, ${slot.duration}min)`);
        });

        // Mark all overlapping slots as booked and link them to the reservation
        for (const slot of overlappingSlots) {
            await connection.execute(`
                UPDATE coach_availability 
                SET is_booked = 1, reservation_id = ?
                WHERE id = ?
            `, [reservationId, slot.id]);
        }

        console.log(`Marked ${overlappingSlots.length} slots as booked`);
        console.log(`=== END MARKING OVERLAPPING SLOTS ===\n`);

        return overlappingSlots.length;
    } catch (error) {
        console.error('Error marking overlapping slots:', error);
        throw error;
    }
}

// Function to mark overlapping slots as available when a reservation is cancelled
// This handles both normal (55 min) and bilan (25 min) sessions
async function freeOverlappingSlots(connection, coachId, date, startTime, endTime, isAdmin = false) {
    try {
        console.log(`\n=== FREEING OVERLAPPING SLOTS ===`);
        console.log(`Coach ID: ${coachId}, Date: ${date}`);
        console.log(`Cancelled reservation time: ${startTime} - ${endTime}`);

        // Get the start and end times as Date objects for comparison
        const reservationStart = new Date(`${date}T${startTime}`);
        const reservationEnd = new Date(`${date}T${endTime}`);
        const now = new Date();

        // Format current date and time for comparison
        const currentDate = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().split(' ')[0];

        // Build the SQL query based on whether it's an admin cancellation
        let query = `
            SELECT id, start_time, end_time, session_type, duration
            FROM coach_availability 
            WHERE coach_id = ? 
            AND date = ? 
            AND is_booked = 1
            AND start_time < ?
            AND end_time > ?
        `;

        let params = [
            coachId, 
            date, 
            endTime,   // Reservation end time
            startTime  // Reservation start time
        ];

        if (!isAdmin) {
            // For client cancellations, only include future slots
            query += `
                AND (
                    date > ? 
                    OR (date = ? AND start_time > ?)
                )
            `;
            params.push(currentDate, currentDate, currentTime);
        }

        // Find all slots on the same date that overlap with the cancelled reservation
        const [overlappingSlots] = await connection.execute(query, params);

        console.log(`Found ${overlappingSlots.length} overlapping slots to free:`);
        overlappingSlots.forEach(slot => {
            console.log(`- Slot ID ${slot.id}: ${slot.start_time}-${slot.end_time} (${slot.session_type}, ${slot.duration}min)`);
        });

        // Mark all overlapping slots as available
        for (const slot of overlappingSlots) {
            await connection.execute(`
                UPDATE coach_availability 
                SET is_booked = 0, reservation_id = NULL
                WHERE id = ?
            `, [slot.id]);
        }

        console.log(`Freed ${overlappingSlots.length} slots`);
        console.log(`=== END FREEING OVERLAPPING SLOTS ===\n`);

        return overlappingSlots.length;
    } catch (error) {
        console.error('Error freeing overlapping slots:', error);
        throw error;
    }
}

// Helper function to generate time slots for coach availability
// Generates both normal (55 min) and bilan (25 min) slots
/**
 * Generates time slots for a specific session type between start and end times
 * @param {string} startTime - Start time in HH:MM:SS format
 * @param {string} endTime - End time in HH:MM:SS format
 * @param {string} sessionType - 'normal' or 'bilan'
 * @returns {Array} Array of time slots with start_time, end_time, session_type, duration
 */
function generateTimeSlots(startTime, endTime, sessionType = 'normal') {
    const slots = [];
    
    // Parse start and end times
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const startTotalMinutes = startHour * 60 + startMin;
    const endTotalMinutes = endHour * 60 + endMin;
    
    if (sessionType === 'bilan') {
        // For bilan sessions: 25-minute slots starting every 30 minutes (5-minute gap)
        // Example: 8:00-8:25, 8:30-8:55, 9:00-9:25, 9:30-9:55, etc.
        
        for (let currentMinutes = startTotalMinutes; currentMinutes < endTotalMinutes; currentMinutes += 30) {
            const slotEndMinutes = currentMinutes + 25; // Changed from 30 to 25 minutes
            
            // Only add if the slot completely fits within the time range
            if (slotEndMinutes <= endTotalMinutes) {
                const startHour = Math.floor(currentMinutes / 60);
                const startMin = currentMinutes % 60;
                const endHour = Math.floor(slotEndMinutes / 60);
                const endMin = slotEndMinutes % 60;
                
                slots.push({
                    start_time: `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}:00`,
                    end_time: `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}:00`,
                    session_type: 'bilan',
                    duration: 25 // Changed from 30 to 25
                });
            }
        }
    } else if (sessionType === 'normal') {
        // For normal sessions: 55-minute slots starting every 30 minutes
        // Example: 8:00-8:55, 8:30-9:25, 9:00-9:55, 9:30-10:25, etc.
        
        for (let currentMinutes = startTotalMinutes; currentMinutes < endTotalMinutes; currentMinutes += 30) {
            const slotEndMinutes = currentMinutes + 55;
            
            // Only add if the slot completely fits within the time range
            if (slotEndMinutes <= endTotalMinutes) {
                const startHour = Math.floor(currentMinutes / 60);
                const startMin = currentMinutes % 60;
                const endHour = Math.floor(slotEndMinutes / 60);
                const endMin = slotEndMinutes % 60;
                
                slots.push({
                    start_time: `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}:00`,
                    end_time: `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}:00`,
                    session_type: 'normal',
                    duration: 55
                });
            }
        }
    }
    
    return slots;
}

module.exports = {
    doPeriodsOverlap,
    markOverlappingSlots,
    freeOverlappingSlots,
    generateTimeSlots
};
