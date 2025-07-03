const db = require('../config/database');

// Helper function to check if two time periods overlap
function doPeriodsOverlap(start1, end1, start2, end2) {
    return start1 < end2 && start2 < end1;
}

// Function to mark overlapping slots as unavailable when a reservation is made
async function markOverlappingSlots(connection, coachId, date, startTime, endTime, reservationId = null) {
    try {
        // Get the start and end times as Date objects for comparison
        const reservationStart = new Date(`${date}T${startTime}`);
        const reservationEnd = new Date(`${date}T${endTime}`);

        // Find all slots on the same date that overlap with the reservation
        const [overlappingSlots] = await connection.execute(`
            SELECT id, start_time, end_time 
            FROM coach_availability 
            WHERE coach_id = ? 
            AND date = ? 
            AND is_booked = 0
            AND (
                (start_time <= ? AND end_time > ?) OR
                (start_time < ? AND end_time >= ?) OR
                (start_time >= ? AND end_time <= ?)
            )
        `, [
            coachId, 
            date, 
            endTime,   // Slot starts before reservation ends
            startTime, // Slot ends after reservation starts
            endTime,   // Reservation ends during slot
            startTime, // Reservation starts during slot
            startTime, // Slot starts during reservation
            endTime    // Slot ends during reservation
        ]);

        // Mark all overlapping slots as booked and link them to the reservation
        for (const slot of overlappingSlots) {
            await connection.execute(`
                UPDATE coach_availability 
                SET is_booked = 1, reservation_id = ?
                WHERE id = ?
            `, [reservationId, slot.id]);
        }

        return overlappingSlots.length;
    } catch (error) {
        console.error('Error marking overlapping slots:', error);
        throw error;
    }
}

// Function to mark overlapping slots as available when a reservation is cancelled
async function freeOverlappingSlots(connection, coachId, date, startTime, endTime, isAdmin = false) {
    try {
        // Get the start and end times as Date objects for comparison
        const reservationStart = new Date(`${date}T${startTime}`);
        const reservationEnd = new Date(`${date}T${endTime}`);
        const now = new Date();

        // Format current date and time for comparison
        const currentDate = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().split(' ')[0];

        // Build the SQL query based on whether it's an admin cancellation
        let query = `
            SELECT id, start_time, end_time 
            FROM coach_availability 
            WHERE coach_id = ? 
            AND date = ? 
            AND is_booked = 1
            AND (
                (start_time <= ? AND end_time > ?) OR
                (start_time < ? AND endTime >= ?) OR
                (start_time >= ? AND end_time <= ?)
            )
        `;

        let params = [
            coachId, 
            date, 
            endTime,   // Slot starts before reservation ends
            startTime, // Slot ends after reservation starts
            endTime,   // Reservation ends during slot
            startTime, // Reservation starts during slot
            startTime, // Slot starts during reservation
            endTime    // Slot ends during reservation
        ];

        if (isAdmin) {
            // For admin cancellations, only include future slots
            query = `
                SELECT id, start_time, end_time 
                FROM coach_availability 
                WHERE coach_id = ? 
                AND date = ? 
                AND is_booked = 1
                AND (
                    (start_time <= ? AND end_time > ?) OR
                    (start_time < ? AND end_time >= ?) OR
                    (start_time >= ? AND end_time <= ?)
                )
                AND (
                    date > ? 
                    OR (date = ? AND start_time > ?)
                )
            `;
            params = [
                coachId, 
                date, 
                endTime,   
                startTime, 
                endTime,   
                startTime, 
                startTime, 
                endTime,
                currentDate,    // Compare with actual date
                currentDate,    // For same-day comparison
                currentTime     // Compare with actual time
            ];
        }

        // Find all slots on the same date that overlap with the cancelled reservation
        const [overlappingSlots] = await connection.execute(query, params);

        // Mark all overlapping slots as available
        for (const slot of overlappingSlots) {
            await connection.execute(`
                UPDATE coach_availability 
                SET is_booked = 0, reservation_id = NULL
                WHERE id = ?
            `, [slot.id]);
        }

        return overlappingSlots.length;
    } catch (error) {
        console.error('Error freeing overlapping slots:', error);
        throw error;
    }
}

module.exports = {
    doPeriodsOverlap,
    markOverlappingSlots,
    freeOverlappingSlots
};
