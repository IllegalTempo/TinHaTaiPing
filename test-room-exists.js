/**
 * WorldPeaceOL Room Check Utility
 * This script checks if a room exists on the server
 */

const { io } = require('socket.io-client');
const fs = require('fs');

// Read test room data
let roomId;
try {
  const data = fs.readFileSync('test-room-data.json');
  const roomData = JSON.parse(data);
  roomId = roomData.roomId;
  console.log(`Found test room ID in file: ${roomId}`);
} catch (err) {
  console.error('Error reading test room data file:', err);
  process.exit(1);
}

// Connect to the server
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to server with socket ID:', socket.id);
  
  // Check if room exists
  console.log(`Checking if room ${roomId} exists...`);
  socket.emit('checkRoom', { roomId });
});

socket.on('roomCheckResult', (data) => {
  console.log('Room check result:', data);
  
  if (data.exists) {
    console.log(`Room ${roomId} exists on the server!`);
    
    // Test joining the room
    console.log(`Attempting to join room ${roomId}...`);
    socket.emit('joinRoom', { roomId });
  } else {
    console.log(`Room ${roomId} does not exist on the server.`);
    console.log(`Reason: ${data.reason || data.error || 'Unknown'}`);
  }
  
  // Exit after 2 seconds to see all events
  setTimeout(() => {
    socket.disconnect();
    process.exit(0);
  }, 2000);
});

socket.on('roomJoined', (data) => {
  console.log('Successfully joined room:', data);
});

socket.on('playerList', (data) => {
  console.log('Player list update:', data);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
}); 