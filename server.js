const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');
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
        'https://coach-reservation.vercel.app',
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

// Mount the routes
app.use('/api/coaches', coachesRoutes);
app.use('/api', reservationsRoutes);  // This will handle /api/reserve and /api/reservations
app.use('/api/coach-dashboard', coachDashboardRoutes); // Routes for coach dashboard
app.use('/api/auth', authRoutes);
app.use('/api', adminRoutes);
app.use('/api', adminPointsRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/packs', packsRoutes);
app.use('/api/user-packs', userPacksRoutes);
app.use('/api/user', profileRoutes);
app.use('/api/group-courses', groupCoursesRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
    console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: 'Route not found' });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`WebSocket server is active on ws://localhost:${PORT}/ws`);
    console.log('Available routes:');
    console.log('- GET /api/coaches');
    console.log('- GET /api/coaches/:id/availability');
    console.log('- GET /api/coaches/:id/all-availability');
    console.log('- POST /api/coaches');
    console.log('- POST /api/coaches/:id/availability');
    console.log('- DELETE /api/coaches/availability/:id');
    console.log('- POST /api/reserve');
    console.log('- GET /api/reservations');
    console.log('- POST /api/reserve-by-admin');
    console.log('- POST /api/auth/coach-login');
    console.log('- GET /api/coach-dashboard/profile');
    console.log('- GET /api/coach-dashboard/reservations');
    console.log('- GET /api/coach-dashboard/availability');
});