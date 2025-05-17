/**
 * WorldPeaceOL Socket Connection Fix
 * 
 * This script helps diagnose and fix issues with socket connections and room assignments
 * in the WorldPeaceOL multiplayer game.
 */

// Import the required modules
const fs = require('fs');
const path = require('path');

console.log('=== WorldPeaceOL Socket Connection Fix ===');

// 1. Check for socket handlers defined outside of io.on('connection') scope
console.log('\nChecking for socket handlers outside connection scope...');

// Read server.js to check for issues
try {
  const serverPath = path.join(__dirname, 'server.js');
  const content = fs.readFileSync(serverPath, 'utf-8');
  const lines = content.split('\n');
  
  let inConnectionScope = false;
  let socketHandlersOutside = 0;
  let braceLevel = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for connection scope start
    if (line.includes('io.on(\'connection\'')) {
      inConnectionScope = true;
      braceLevel = 0;
    }
    
    // Count braces to track scope
    if (inConnectionScope) {
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceLevel += openBraces - closeBraces;
      
      // If braceLevel reaches 0, we've exited the connection scope
      if (braceLevel === 0 && line.includes('}')) {
        inConnectionScope = false;
      }
    }
    
    // Look for socket handlers outside connection scope
    if (!inConnectionScope && line.includes('socket.on(') && !line.includes('// Test')) {
      socketHandlersOutside++;
      console.log(`[ISSUE] Line ${i + 1}: Socket handler outside connection scope: ${line.trim()}`);
    }
  }
  
  if (socketHandlersOutside > 0) {
    console.log(`\n[ERROR] Found ${socketHandlersOutside} socket handlers defined outside connection scope.`);
    console.log('These handlers need to be moved inside the io.on(\'connection\') scope.');
  } else {
    console.log('[OK] No socket handlers found outside connection scope.');
  }
  
  // 2. Check for room joining issues
  console.log('\nChecking for room joining issues...');
  let joinRoomHandler = false;
  let roomJoinedEmit = false;
  let checkRoomHandler = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('socket.on(\'joinRoom\'')) {
      joinRoomHandler = true;
    }
    
    if (line.includes('emit(\'roomJoined\'')) {
      roomJoinedEmit = true;
    }
    
    if (line.includes('socket.on(\'checkRoom\'')) {
      checkRoomHandler = true;
    }
  }
  
  if (!joinRoomHandler) {
    console.log('[ISSUE] No joinRoom handler found.');
  }
  
  if (!roomJoinedEmit) {
    console.log('[ISSUE] No roomJoined event emission found.');
  }
  
  if (!checkRoomHandler) {
    console.log('[ISSUE] No checkRoom handler found.');
  }
  
  if (joinRoomHandler && roomJoinedEmit && checkRoomHandler) {
    console.log('[OK] Room joining handlers found.');
  }
  
  // 3. Check room-related data structures
  console.log('\nChecking room-related data structures...');
  let roomsMap = false;
  let userRoomsMap = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('const rooms = new Map()')) {
      roomsMap = true;
    }
    
    if (line.includes('const userRooms = new Map()')) {
      userRoomsMap = true;
    }
  }
  
  if (!roomsMap) {
    console.log('[ISSUE] rooms Map not defined.');
  }
  
  if (!userRoomsMap) {
    console.log('[ISSUE] userRooms Map not defined.');
  }
  
  if (roomsMap && userRoomsMap) {
    console.log('[OK] Room-related data structures found.');
  }
  
  // 4. Check if client-side code properly joins rooms
  console.log('\nChecking client-side room joining code...');
  
  try {
    const gameRoomPath = path.join(__dirname, 'game-room.html');
    const clientContent = fs.readFileSync(gameRoomPath, 'utf-8');
    const clientLines = clientContent.split('\n');
    
    let checkRoomCall = false;
    let handleRoomJoined = false;
    
    for (let i = 0; i < clientLines.length; i++) {
      const line = clientLines[i];
      
      if (line.includes('socket.emit(\'checkRoom\'')) {
        checkRoomCall = true;
      }
      
      if (line.includes('socket.on(\'roomJoined\'')) {
        handleRoomJoined = true;
      }
    }
    
    if (!checkRoomCall) {
      console.log('[ISSUE] Client does not call checkRoom.');
    }
    
    if (!handleRoomJoined) {
      console.log('[ISSUE] Client does not handle roomJoined event.');
    }
    
    if (checkRoomCall && handleRoomJoined) {
      console.log('[OK] Client-side room joining code found.');
    }
  } catch (err) {
    console.log(`[ERROR] Could not read game-room.html: ${err.message}`);
  }
  
  console.log('\n=== Fix Recommendations ===');
  console.log('1. Ensure all socket event handlers are defined within the io.on(\'connection\') scope');
  console.log('2. Check that userRooms mapping is being updated correctly when players join rooms');
  console.log('3. Ensure socket.join() is called when a player joins a room');
  console.log('4. Update the client to properly handle roomJoined events');
  console.log('5. Add a fallback mechanism to automatically retry room joining if it fails');
  
} catch (err) {
  console.error(`Error analyzing server.js: ${err.message}`);
}
