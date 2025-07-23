const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Migration endpoint to add status column to coach_availability
router.post('/add-slot-status', async (req, res) => {
    try {
        console.log('Starting migration: Adding status column to coach_availability table');
        
        // Check if status column already exists
        const [columns] = await db.execute(`
            SHOW COLUMNS FROM coach_availability LIKE 'status'
        `);
        
        if (columns.length > 0) {
            return res.json({ 
                message: 'Status column already exists', 
                success: true 
            });
        }
        
        // Add status column
        await db.execute(`
            ALTER TABLE coach_availability 
            ADD COLUMN status ENUM('available', 'booked', 'overlapping', 'unavailable') DEFAULT 'available' 
            COMMENT 'Status of the time slot: available, booked (actual reservation), overlapping (conflicts with another booking), unavailable (manually disabled)'
        `);
        
        console.log('Added status column');
        
        // Update existing data
        await db.execute(`
            UPDATE coach_availability 
            SET status = CASE 
                WHEN is_booked = 1 THEN 'booked'
                WHEN is_booked = 0 THEN 'available'
                ELSE 'available'
            END
        `);
        
        console.log('Updated existing data with new status values');
        
        // Add indexes
        try {
            await db.execute(`CREATE INDEX idx_coach_availability_status ON coach_availability (status)`);
            console.log('Added status index');
        } catch (indexError) {
            console.log('Index may already exist:', indexError.message);
        }
        
        try {
            await db.execute(`CREATE INDEX idx_coach_availability_coach_date_status ON coach_availability (coach_id, date, status)`);
            console.log('Added composite index');
        } catch (indexError) {
            console.log('Composite index may already exist:', indexError.message);
        }
        
        console.log('Migration completed successfully');
        
        res.json({ 
            message: 'Successfully added status column and updated existing data', 
            success: true 
        });
        
    } catch (error) {
        console.error('Migration failed:', error);
        res.status(500).json({ 
            error: 'Migration failed', 
            message: error.message 
        });
    }
});

module.exports = router;
