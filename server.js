const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');
const { handleDatabaseError } = require('./middleware/databaseErrorHandler');
const db = require('./config/database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Create an HTTP server and WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store active WebSocket connections by user ID
const clients = new Map();

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  console.log('WebSocket client connected');
  
  // Authentication for WebSocket connections
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // If the message is an authentication message, store the user ID
      if (data.type === 'auth') {
        const userId = data.userId;
        if (userId) {
          clients.set(userId, ws);
          console.log(`WebSocket: User ${userId} authenticated`);
          
          // Send confirmation back to client
          ws.send(JSON.stringify({ 
            type: 'auth_success',
            message: 'Authentication successful'
          }));
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    // Remove client from the map
    for (let [userId, client] of clients.entries()) {
      if (client === ws) {
        clients.delete(userId);
        console.log(`WebSocket: User ${userId} disconnected`);
        break;
      }
    }
  });
});

// Export the WebSocket functionality for use in routes
global.notifyUser = (userId, data) => {
  const client = clients.get(userId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(data));
    console.log(`WebSocket: Notification sent to user ${userId}`, data);
    return true;
  }
  console.log(`WebSocket: User ${userId} not connected or ready`);
  return false;
};

// Middleware
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://coach-reservation-l1viiu9sm-elmahdi-boudernas-projects.vercel.app/',
        'https://coach-reservation-git-main-elmahdi-boudernas-projects.vercel.app/',
        'https://coach-reservation.vercel.app',
        'https://fitlek.tech',
        'https://www.fitlek.tech',
        'https://coach-reservation-frontend.onrender.com',
        'https://your-custom-domain.com'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
const coachesRoutes = require('./routes/coaches');
const reservationsRoutes = require('./routes/reservations');
const { router: authRoutes } = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const adminPointsRoutes = require('./routes/admin-points');
const uploadsRoutes = require('./routes/uploads');
const coachDashboardRoutes = require('./routes/coach');
const packsRoutes = require('./routes/packs');
const userPacksRoutes = require('./routes/user-packs');
const profileRoutes = require('./routes/profile');
const groupCoursesRoutes = require('./routes/group-courses');
const adminPaymentsRoutes = require('./routes/admin-payments');
const healthRoutes = require('./routes/health');
const migrationRoutes = require('./routes/migration');

// Mount the routes
app.use('/api/health', healthRoutes);
app.use('/api/migration', migrationRoutes);
app.use('/api/coaches', coachesRoutes);
app.use('/api', reservationsRoutes);  // This will handle /api/reserve and /api/reservations
app.use('/api/coach-dashboard', coachDashboardRoutes); // Routes for coach dashboard
app.use('/api/auth', authRoutes);
app.use('/api', adminRoutes);  // Admin routes are defined with /admin prefix in the router
app.use('/api', adminPointsRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/packs', packsRoutes);
app.use('/api/user-packs', userPacksRoutes);
app.use('/api/user', profileRoutes);
app.use('/api/group-courses', groupCoursesRoutes);
app.use('/api', adminPaymentsRoutes);

// Database error handling middleware (must be before general error handler)
app.use(handleDatabaseError);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('General error occurred:', {
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
    });
    
    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(err.status || 500).json({
        error: isDevelopment ? err.message : 'Internal server error',
        ...(isDevelopment && { stack: err.stack })
    });
});

// 404 handler
app.use('*', (req, res) => {
    console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: 'Route not found' });
});

// Start server
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`WebSocket server is active on ws://localhost:${PORT}/ws`);
    
    // Test database connection on startup
    try {
        const isHealthy = await db.healthCheck();
        if (isHealthy) {
            console.log('✅ Database connection established successfully');
            
            // Check and create required tables in production
            if (process.env.NODE_ENV === 'production') {
                console.log('🔍 Production mode: Checking required tables...');
                try {
                    await checkRequiredTables();
                    console.log('✅ All required tables are available');
                } catch (tableError) {
                    console.error('❌ Table check failed:', tableError.message);
                    console.log('⚠️  Some API endpoints may not work correctly');
                }
            }
        } else {
            console.log('❌ Database connection failed');
        }
    } catch (error) {
        console.error('❌ Database startup check failed:', error.message);
    }
    
    console.log('Available routes:');
    console.log('- GET /api/health - Health check with database test');
    console.log('- GET /api/health/database - Database connection test');
    console.log('- POST /api/health/warm - Warm database connection');
    console.log('- GET /api/coaches');
    console.log('- GET /api/coaches/:id/availability');
    console.log('- GET /api/coaches/:id/all-availability');
    console.log('- POST /api/coaches');
    console.log('- POST /api/coaches/:id/availability');
    console.log('- DELETE /api/coaches/availability/:id');
    console.log('- POST /api/coaches/availability/bulk-delete');
    console.log('- POST /api/reserve');
    console.log('- GET /api/reservations');
    console.log('- POST /api/reserve-by-admin');
    console.log('- POST /api/auth/coach-login');
    console.log('- GET /api/coach-dashboard/profile');
    console.log('- GET /api/coach-dashboard/reservations');
    console.log('- GET /api/coach-dashboard/availability');
});

// Function to check required tables
async function checkRequiredTables() {
    const requiredTables = ['packs', 'group_courses', 'group_reservations', 'user_packs'];
    
    for (const table of requiredTables) {
        try {
            await db.execute(`SELECT 1 FROM ${table} LIMIT 1`);
            console.log(`✅ Table '${table}' exists`);
        } catch (error) {
            if (error.errno === 1146) {
                console.error(`❌ Missing table: ${table}`);
                throw new Error(`Required table '${table}' does not exist. Please run database migration.`);
            } else {
                throw error;
            }
        }
    }
}