/**
 * WorldPeaceOL Dummy Room Creator
 * This script creates a dummy room that can be joined through the game UI
 */

// Load environment variables
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Create a unique room ID for in-memory use
const roomId = 'TEST' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');

// Print out the room URL for testing
console.log(`Creating test room with ID: ${roomId}`);
console.log(`Room URL: http://localhost:3000/game-room.html?room=${roomId}`);

// Create a room in memory and in the database
async function createRoom() {
  try {
    // Create test user if needed
    let testUser = await prisma.user.findUnique({
      where: { username: 'TestUser' }
    });
    
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          username: 'TestUser',
          email: 'test@example.com',
          password: 'password123',
          elo: 1500
        }
      });
      console.log('Created test user:', testUser.username);
    }
    
    // Create a second test user (since Match requires both player1 and player2)
    let testUser2 = await prisma.user.findUnique({
      where: { username: 'TestUser2' }
    });
    
    if (!testUser2) {
      testUser2 = await prisma.user.create({
        data: {
          username: 'TestUser2',
          email: 'test2@example.com',
          password: 'password123',
          elo: 1500
        }
      });
      console.log('Created second test user:', testUser2.username);
    }
    
    // Create a match record (Match.id is an int auto-increment)
    const match = await prisma.match.create({
      data: {
        player1Id: testUser.id,
        player2Id: testUser2.id,
        gameMode: 'classic',
        completed: false
      }
    });
    
    console.log('Created match record with ID:', match.id);
    
    // Update both users' lastRoom to point to our room ID string
    await prisma.user.update({
      where: { id: testUser.id },
      data: { lastRoom: roomId }
    });
    
    await prisma.user.update({
      where: { id: testUser2.id },
      data: { lastRoom: roomId }
    });
    
    console.log(`Updated users with lastRoom = ${roomId}`);
    console.log('Done! The room is now ready to be joined.');
    console.log(`Visit: http://localhost:3000/game-room.html?room=${roomId}`);
    
    // Create a data file to let the server know about this test room
    const fs = require('fs');
    fs.writeFileSync('test-room-data.json', JSON.stringify({
      roomId,
      player1Id: testUser.id,
      player2Id: testUser2.id,
      matchId: match.id,
      created: new Date().toISOString()
    }));
    
    console.log('Created test-room-data.json file for server initialization');
    
  } catch (error) {
    console.error('Error creating room:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createRoom(); 