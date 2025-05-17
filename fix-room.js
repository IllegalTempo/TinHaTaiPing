/**
 * WorldPeaceOL Room URL Fix
 * 
 * This script helps diagnose and fix issues with room URL parameters
 * in the WorldPeaceOL multiplayer game.
 */

// Import the required modules
const fs = require('fs');
const path = require('path');

console.log('=== WorldPeaceOL Room URL Fix ===');

// Check all files for URL parameter inconsistencies
const files = [
  'index.html',
  'game-room.html',
  'create-room.html',
  'friends.html',
  'pairing.html'
];

// Track parameter usage
const roomParams = {
  'room': [],
  'roomId': []
};

files.forEach(file => {
  try {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Check for room= in URLs
      const roomMatches = content.match(/[?&]room=([^&"']+)/g);
      if (roomMatches) {
        roomParams.room.push({ file, count: roomMatches.length });
      }
      
      // Check for roomId= in URLs
      const roomIdMatches = content.match(/[?&]roomId=([^&"']+)/g);
      if (roomIdMatches) {
        roomParams.roomId.push({ file, count: roomIdMatches.length });
      }
    }
  } catch (err) {
    console.error(`Error reading ${file}: ${err.message}`);
  }
});

console.log('\n=== URL Parameter Usage ===');
console.log('Files using room= parameter:');
roomParams.room.forEach(item => {
  console.log(`  - ${item.file}: ${item.count} occurrences`);
});

console.log('\nFiles using roomId= parameter:');
roomParams.roomId.forEach(item => {
  console.log(`  - ${item.file}: ${item.count} occurrences`);
});

// Check game-room.html for room parameter handling
try {
  const gameRoomPath = path.join(__dirname, 'game-room.html');
  const content = fs.readFileSync(gameRoomPath, 'utf-8');
  
  // Check if game-room.html handles both parameters
  const handlesRoom = content.includes(".get('room')");
  const handlesRoomId = content.includes(".get('roomId')");
  const handlesBoth = content.includes("room') || urlParams.get('roomId");
  
  console.log('\n=== Room Parameter Handling ===');
  console.log(`game-room.html handles 'room' parameter: ${handlesRoom ? 'YES' : 'NO'}`);
  console.log(`game-room.html handles 'roomId' parameter: ${handlesRoomId ? 'YES' : 'NO'}`);
  console.log(`game-room.html handles both parameters with fallback: ${handlesBoth ? 'YES' : 'NO'}`);
  
  if (!handlesBoth) {
    console.log('\n[ISSUE] game-room.html does not properly handle both room parameter formats');
    console.log('Fix: Update code to check for both parameters with: urlParams.get(\'room\') || urlParams.get(\'roomId\')');
  }
  
} catch (err) {
  console.error(`Error checking game-room.html: ${err.message}`);
}

// Check server.js for proper error handling in checkRoom
try {
  const serverPath = path.join(__dirname, 'server.js');
  const content = fs.readFileSync(serverPath, 'utf-8');
  
  // Look for good error logging in checkRoom handler
  const hasDetailedErrorLog = content.includes("Socket tried to toggle ready status but is not in a room");
  const handlesLastRoom = content.includes("user.lastRoom");
  
  console.log('\n=== Server Room Handling ===');
  console.log(`server.js has detailed error logging: ${hasDetailedErrorLog ? 'YES' : 'NO'}`);
  console.log(`server.js handles lastRoom for users: ${handlesLastRoom ? 'YES' : 'NO'}`);
  
  // Check if playerList event is being sent
  const sendsPlayerList = content.includes("emit('playerList'");
  console.log(`server.js sends playerList events: ${sendsPlayerList ? 'YES' : 'NO'}`);
  
} catch (err) {
  console.error(`Error checking server.js: ${err.message}`);
}

console.log('\n=== Recommendations ===');
console.log('1. Standardize on a single parameter name (recommend "room") across all files');
console.log('2. Update client code to handle both "room" and "roomId" parameters for backwards compatibility');
console.log('3. Ensure server-side checkRoom handler properly joins players to rooms and sends playerList updates');
console.log('4. Add more detailed error logging for room joining failures'); 