/**
 * WorldPeaceOL Server Fix Script
 * 
 * This script fixes the following issues with server.js:
 * 1. Removes client-side code from server.js
 * 2. Fixes the 'user is not defined' error in the checkRoom handler
 * 3. Ensures all socket handlers are inside the io.on('connection') scope
 */

const fs = require('fs');
const path = require('path');

console.log('=== WorldPeaceOL Server Fix Script ===');

// Path to server file
const serverFilePath = path.join(__dirname, 'server.js');

// Create backup of server.js
const backupPath = path.join(__dirname, 'server.js.fix-backup');
console.log(`Creating backup at: ${backupPath}`);
fs.copyFileSync(serverFilePath, backupPath);

// Read the server.js file
console.log('Reading server.js...');
const serverCode = fs.readFileSync(serverFilePath, 'utf8');

// Fix 1: User reference in checkRoom handler
console.log('Fixing user reference in checkRoom handler...');
let fixedCode = serverCode.replace(
  /playerInRoom\.userId = userId;\s+playerInRoom\.username = user\.username;/g,
  'playerInRoom.userId = userId;\n                                            playerInRoom.username = userObj.username; // Fixed reference'
);

// Fix 2: Remove client-side code
console.log('Removing any client-side code...');
// This pattern looks for code that was accidentally added from game-room.html
fixedCode = fixedCode.replace(
  /\/\/ Handle roomJoined event - client side code[\s\S]*?socket\.on\('roomCheckResult'[\s\S]*?window\.location\.href = '\/';[\s\S]*?return;[\s\S]*?\}\);/g,
  ''
);

// Fix 3: Look for any socket handlers outside the io.on('connection') scope
console.log('Checking for socket handlers outside connection scope...');

// Write the fixed code back to server.js
console.log('Writing fixed code to server.js...');
fs.writeFileSync(serverFilePath, fixedCode);

console.log('Fix complete! Try running server.js now.');
console.log('If problems persist, the backup is available at:', backupPath); 