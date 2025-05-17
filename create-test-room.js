/**
 * WorldPeaceOL Test Room Creator
 * 
 * This script helps test room creation and fixing URL parameter handling
 */

const { createServer } = require('http');
const { Server } = require('socket.io');
const express = require('express');
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Track rooms
const testRooms = new Map();

console.log('=== WorldPeaceOL Test Room Creator ===');

// Create a test room
function createTestRoom() {
  const roomId = 'TEST' + Math.floor(Math.random() * 1000).toString().padStart(4, '0');
  
  testRooms.set(roomId, {
    id: roomId,
    created: Date.now(),
    players: [{
      socketId: null,
      userId: 999, // Test user id
      username: 'TestUser',
      isHost: true,
      ready: false,
      disconnected: false
    }],
    gameMode: 'classic',
    Started: false
  });
  
  console.log(`Created test room with ID: ${roomId}`);
  console.log(`URL to join: http://localhost:3000/game-room.html?room=${roomId}`);
  
  // Set timeout to remove room after 5 minutes
  setTimeout(() => {
    if (testRooms.has(roomId)) {
      testRooms.delete(roomId);
      console.log(`Test room ${roomId} has expired.`);
    }
  }, 5 * 60 * 1000);
  
  return roomId;
}

// Express endpoint to create a test room
app.get('/create-test-room', (req, res) => {
  const roomId = createTestRoom();
  res.json({ roomId, success: true });
});

// Socket.io handler for test room checking
io.on('connection', (socket) => {
  console.log(`Test client connected: ${socket.id}`);
  
  socket.on('checkTestRoom', ({ roomId }) => {
    const exists = testRooms.has(roomId);
    socket.emit('testRoomResult', { exists, roomId });
    console.log(`Room check for ${roomId}: ${exists ? 'exists' : 'not found'}`);
  });
});

// Start server on a different port to avoid conflicts
const TEST_PORT = 3001;
httpServer.listen(TEST_PORT, () => {
  console.log(`Test server running on http://localhost:${TEST_PORT}`);
  console.log(`To create a test room, visit: http://localhost:${TEST_PORT}/create-test-room`);
  console.log(`Press Ctrl+C to exit`);
  
  // Create a test room automatically
  createTestRoom();
}); 