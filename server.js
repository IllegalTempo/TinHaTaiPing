const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const prisma = require('./prisma/client');
const { createServer } = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;

// Ensure db directory exists
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Store room data globally
const rooms = new Map();
// Store which room each socket is in
const userRooms = new Map();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Create session middleware using memory store for Vercel (note: in production you would want to use a proper session store)
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'tianxia-taiping-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', 
        maxAge: 24 * 60 * 60 * 1000, // 1 day
        httpOnly: true,
        sameSite: 'lax'
    }
});

// Apply session middleware to Express
app.use(sessionMiddleware);

// Share session with Socket.IO
io.use((socket, next) => {
    sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// Serve static files from the current directory
app.use(express.static(__dirname));

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
};

// Admin middleware
const isAdmin = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Admin is defined as a user with rank >= 10
    if (user.rank < 10) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Server error checking admin status' });
  }
};

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Handle room check
    socket.on('checkRoom', (data) => {
        const { roomId } = data;
        const roomExists = rooms.has(roomId);
        
        console.log(`Checking if room ${roomId} exists: ${roomExists}`);
        
        // Respond with existence status
        socket.emit('roomCheckResult', { 
            exists: roomExists,
            roomId
        });
    });

    // Handle room creation
    socket.on('createRoom', async (data) => {
        try {
            // Check if user is already in a room
            if (userRooms.has(socket.id)) {
                const currentRoomId = userRooms.get(socket.id);
                console.log(`User ${socket.id} is already in room ${currentRoomId}, leaving before creating new room`);
                
                // Leave current room first
                await leaveRoom(socket, currentRoomId);
            }
            
            // Use provided room ID or generate a new one
            const roomId = data.roomId || Math.random().toString(36).substring(2, 8).toUpperCase();
            
            // Check if room already exists
            if (rooms.has(roomId)) {
                socket.emit('error', { message: 'Room already exists' });
                return;
            }
            
            // Create the room
            socket.join(roomId);
            
            // Initialize room data with username
            const roomData = {
              Started:false,
                players: [{
                    socketId: socket.id,
                    username: data.username || 'Player 1',
                    isHost: true
                }]
            };
            rooms.set(roomId, roomData);
            
            // Associate this socket with the room
            userRooms.set(socket.id, roomId);
            
            // Save the room ID to the user's database record if they're logged in
            if (socket.request && socket.request.session && socket.request.session.userId) {
                try {
                    await prisma.user.update({
                        where: { id: socket.request.session.userId },
                        data: { lastRoom: roomId }
                    });
                    console.log(`Saved lastRoom=${roomId} for user ID ${socket.request.session.userId}`);
                } catch (dbError) {
                    console.error('Error saving lastRoom to database:', dbError);
                }
            }
            
            // Notify the creator that the room was created
            socket.emit('roomCreated', { roomId });
            
            // Send initial player list to all clients in the room (including creator)
            io.in(roomId).emit('playerList', {
                players: roomData.players
            });
            
            console.log(`Room created: ${roomId} by user: ${data.username} (${socket.id})`);
        } catch (error) {
            console.error('Error creating room:', error);
            socket.emit('error', { message: 'Failed to create room' });
        }
    });

    // Handle room joining
    socket.on('joinRoom', (data) => {
        const { roomId, username } = data;
        console.log(`User ${username} (${socket.id}) attempting to join room ${roomId}`);
        
        // Check if user is already in a room
        if (userRooms.has(socket.id)) {
            const currentRoomId = userRooms.get(socket.id);
            console.log(`User ${socket.id} is already in room ${currentRoomId}, leaving before joining new room`);
            
            // Leave current room first
            leaveRoom(socket, currentRoomId)
                .then(() => {
                    // Continue with join after leaving
                    processRoomJoin(socket, roomId, username);
                })
                .catch(error => {
                    console.error('Error leaving current room:', error);
                    socket.emit('error', { message: 'Failed to join room' });
                });
        } else {
            // Not in any room, proceed with join
            processRoomJoin(socket, roomId, username);
        }
    });

    // Handle joining an existing room
    function processRoomJoin(socket, roomId, username) {
        if (!rooms.has(roomId)) {
            socket.emit('error', { message: 'room_not_found' });
            return;
        }
        
        const room = rooms.get(roomId);
        
        // Check if game already started
        if (room.Started) {
            // If the game has started, check if this player was previously in the room
            // This would allow players to reconnect if they lost connection
            const isReconnect = room.gameState && room.gameState.players.some(p => p.username === username);
            
            if (!isReconnect) {
                socket.emit('error', { message: 'game_already_started' });
                return;
            }
            
            // If this is a reconnect, let them join
            console.log(`Player ${username} is rejoining a started game in room ${roomId}`);
        } else {
            // For games that haven't started yet
            
            // Check if room is full (2 players)
            if (room.players.length >= 2) {
                socket.emit('error', { message: 'room_full' });
                return;
            }
            
            // Check if username is already taken in this room
            if (room.players.some(p => p.username === username)) {
                socket.emit('error', { message: 'username_taken' });
                return;
            }
        }
        
        // Join the room
        socket.join(roomId);
        
        // If game already started, update the player's socket ID in the game state
        if (room.Started && room.gameState) {
            // Find player in game state and update their socket ID
            const playerInGame = room.gameState.players.find(p => p.username === username);
            if (playerInGame) {
                playerInGame.id = socket.id;
            }
            
            // Add player to the room.players array if they're not there
            const playerInRoom = room.players.find(p => p.username === username);
            if (!playerInRoom) {
                room.players.push({ 
                    socketId: socket.id,
                    username, 
                    isHost: false 
                });
            } else {
                // Update existing player's socket ID
                playerInRoom.socketId = socket.id;
            }
            
            // Send game state to the reconnected player
            socket.emit('gameStarted', room.gameState);
        } else {
            // Regular join for a game that hasn't started
            room.players.push({ 
                socketId: socket.id,
                username, 
                isHost: false 
            });
        }
        
        // Associate this socket with the room
        userRooms.set(socket.id, roomId);
        
        // Save the room ID to the user's database record if they're logged in
        if (socket.request && socket.request.session && socket.request.session.userId) {
            try {
                prisma.user.update({
                    where: { id: socket.request.session.userId },
                    data: { lastRoom: roomId }
                }).then(() => {
                    console.log(`Saved lastRoom=${roomId} for user ID ${socket.request.session.userId}`);
                }).catch(dbError => {
                    console.error('Error saving lastRoom to database:', dbError);
                });
            } catch (dbError) {
                console.error('Error saving lastRoom to database:', dbError);
            }
        }
        
        console.log(`User ${username} (${socket.id}) joined room ${roomId}`);
        logUserRoomMap();
        
        // Send updated player list to all clients in the room
        io.to(roomId).emit('playerList', { players: room.players });
    }

    // Handle leaving room
    socket.on('leaveRoom', () => {
        try {
            // Get the room from userRooms map
            const roomId = userRooms.get(socket.id);
            if (!roomId) {
                socket.emit('error', { message: 'not_in_room' });
                return;
            }
            
            leaveRoom(socket, roomId);
        } catch (error) {
            console.error('Error leaving room:', error);
        }
    });

    // Reusable function for leaving a room
    async function leaveRoom(socket, roomId) {
        const room = rooms.get(roomId);
        
        if (room) {
            // Find the leaving player
            const leavingPlayer = room.players.find(p => p.socketId === socket.id);
            
            // Remove player from room
            room.players = room.players.filter(p => p.socketId !== socket.id);
            
            // Remove the socket from the user-room mapping
            userRooms.delete(socket.id);
            
            // If room is empty, delete it
            if (room.players.length === 0) {
                rooms.delete(roomId);
                console.log(`Room ${roomId} deleted because it's empty`);
                
                // If the user is logged in, clear their lastRoom since the room no longer exists
                if (socket.request && socket.request.session && socket.request.session.userId) {
                    try {
                        await prisma.user.update({
                            where: { id: socket.request.session.userId },
                            data: { lastRoom: null }
                        });
                        console.log(`Cleared lastRoom for user ID ${socket.request.session.userId} as room was deleted`);
                    } catch (dbError) {
                        console.error('Error clearing lastRoom in database:', dbError);
                    }
                }
            } else {
                
                // Update remaining players
                io.to(roomId).emit('playerList', {
                    players: room.players
                });
                
                // Notify remaining players that someone left
                io.to(roomId).emit('playerLeft', {
                    username: leavingPlayer?.username,
                    isHost: leavingPlayer?.isHost
                });
            }
            
            // Leave the socket room
            socket.leave(roomId);
            
            console.log(`User ${socket.id} left room ${roomId}`);
            logUserRoomMap();
            
            return true;
        }
        
        return false;
    }

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Check if user was in a room
        if (userRooms.has(socket.id)) {
            const roomId = userRooms.get(socket.id);
            console.log(`Disconnected user ${socket.id} was in room ${roomId}, cleaning up`);
            
            leaveRoom(socket, roomId);
        } else {
            console.log(`Disconnected user ${socket.id} was not in any room`);
        }
    });

    // Debug function to log the current user-room map
    function logUserRoomMap() {
    }

    // Handle start game
    socket.on('startGame', () => {
        // Get the room from userRooms map
        const roomId = userRooms.get(socket.id);
        if (!roomId) {
            socket.emit('error', { message: 'not_in_room' });
            return;
        }
        
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('error', { message: 'room_not_found' });
            return;
        }
        
        // Check if sender is the host
        const player = room.players.find(p => p.socketId === socket.id);
        if (!player || !player.isHost) {
            socket.emit('error', { message: 'only_host_can_start' });
            return;
        }
        
        // Check if there are exactly 2 players
        if (room.players.length !== 2) {
            socket.emit('error', { message: 'need_two_players' });
            return;
        }
        
        // Check if game already started
        if (room.gameState && room.gameState.started) {
            socket.emit('error', { message: 'game_already_started' });
            return;
        }
        
        console.log(`Starting game in room ${roomId}`);
        
        // Set the Started flag to true
        room.Started = true;
        
        // Initialize game state
        // Place two minerals: one for each side (static positions for now)
        room.gameState = {
            started: true,
            players: room.players.map(p => ({
                id: p.socketId,
                username: p.username,
                gold: 500,
                hp: 100
            })),
            units: [],
            minerals: [
                { id: 1, x: 100, y: 300 }, // left mineral
                { id: 2, x: 900, y: 300 }  // right mineral
            ]
        };
        
        // Send initial game state to all players
        io.to(roomId).emit('gameStarted', room.gameState);

        // Start mining interval for this room when the game starts
        startMiningInterval(roomId);
    });

    // Handle mineral collection
    socket.on('collectMineral', (data) => {
        const { position, value } = data;
        
        // Get the room from userRooms map
        const roomId = userRooms.get(socket.id);
        if (!roomId) {
            socket.emit('error', { message: 'not_in_room' });
            return;
        }
        
        const room = rooms.get(roomId);
        
        // Only process if room exists, game has started, and game state is initialized
        if (!room || !room.gameState || !room.gameState.started) return;
        
        const player = room.gameState.players.find(p => p.id === socket.id || p.socketId === socket.id);
        if (!player) return;
        
        // Add gold to player (fixed value of 75)
        player.gold += value || 75;
        
        // Get both players' gold amounts
        const playersGold = room.gameState.players.map(p => ({
            playerId: p.id || p.socketId,
            gold: p.gold
        }));
        
        // Notify all players with complete gold information
        io.to(roomId).emit('goldSyncUpdate', {
            players: playersGold
        });
    });

    // Handle unit spawn
    socket.on('spawnUnit', (data) => {
        const { unitId, unitType, x, y, isLeftPlayer } = data;
        
        // Get the room from userRooms map
        const roomId = userRooms.get(socket.id);
        if (!roomId) {
            socket.emit('error', { message: 'not_in_room' });
            return;
        }
        
        const room = rooms.get(roomId);
        
        // Only process if room exists, game has started, and game state is initialized
        if (!room || !room.gameState || !room.gameState.started) {
            console.log(`Invalid unit spawn attempt: room exists=${!!room}, game started=${room?.gameState?.started}`);
            return;
        }
        
        // Find player by socket ID
        let player = room.gameState.players.find(p => p.id === socket.id);
        if (!player) {
            // Try finding by socketId if not found by id
            player = room.gameState.players.find(p => p.socketId === socket.id);
            if (!player) {
                console.log(`Player not found for socket ID: ${socket.id}`);
                return;
            }
        }
        
        const cost = unitType === 'miner' ? 100 : 200;
        if (player.gold < cost) {
            console.log(`Not enough gold: player has ${player.gold}, needs ${cost}`);
            socket.emit('error', { message: 'not_enough_gold' });
            return;
        }
        
        // Deduct gold
        player.gold -= cost;
        
        console.log(`Player ${socket.id} spawned ${unitType} at (${x}, ${y}), isLeftPlayer: ${isLeftPlayer}`);
        
        // Broadcast unit spawn to all clients in the room
        const unitData = {
            id: unitId || Date.now(),
            type: unitType,
            x,
            y,
            isLeftPlayer,
            playerId: socket.id // Track owner
        };
        
        // Add to server-side unit list for this room
        if (!room.gameState.units) room.gameState.units = [];
        room.gameState.units.push(unitData);
        
        // Emit to all clients in the room
        io.to(roomId).emit('unitSpawned', unitData);
        
        // Get both players' gold amounts
        const playersGold = room.gameState.players.map(p => ({
            playerId: p.id || p.socketId,
            gold: p.gold
        }));
        
        // Send gold update to all players
        io.to(roomId).emit('goldSyncUpdate', {
            players: playersGold
        });
    });

    // --- Server-side mining tick ---
    // Start mining interval for this room when the game starts
    function startMiningInterval(roomId) {
        const room = rooms.get(roomId);
        if (!room) return;
        if (room.miningInterval) return; // Already running
        room.miningInterval = setInterval(() => {
            if (!room.gameState || !room.gameState.units || !room.gameState.minerals) return;
            // For each miner unit, check if it's close to a mineral
            room.gameState.units.forEach(unit => {
                if (unit.type !== 'miner') return;
                // Use unit.x, unit.y (should be updated by client on move)
                const isNearMineral = room.gameState.minerals.some(mineral => {
                    const dx = (unit.x ?? 0) - mineral.x;
                    const dy = (unit.y ?? 0) - mineral.y;
                    return Math.sqrt(dx*dx + dy*dy) < 32;
                });
                if (isNearMineral) {
                    // Find player
                    let player = room.gameState.players.find(p => p.id === unit.playerId || p.socketId === unit.playerId);
                    if (player) {
                        player.gold += 50;
                    }
                }
            });
            // Sync gold for both players
            io.to(roomId).emit('goldSyncUpdate', {
                players: room.gameState.players.map(p => ({ playerId: p.id || p.socketId, gold: p.gold }))
            });
        }, 1000);
    }

    // Mining: Only the owner of the mining unit gets the gold
    socket.on('collectMineral', (data) => {
        const { unitId, x, y } = data; // Expect miner's position from client
        const roomId = userRooms.get(socket.id);
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room || !room.gameState || !room.gameState.units || !room.gameState.minerals) return;
        const unit = room.gameState.units.find(u => u.id === unitId);
        if (!unit || unit.type !== 'miner') return;
        // Only the owner can collect
        if (unit.playerId !== socket.id) return;
        // Check if miner is close enough to any mineral
        const isNearMineral = room.gameState.minerals.some(mineral => {
            const dx = (x ?? unit.x) - mineral.x;
            const dy = (y ?? unit.y) - mineral.y;
            return Math.sqrt(dx*dx + dy*dy) < 32;
        });
        if (!isNearMineral) return;
        // Find player
        let player = room.gameState.players.find(p => p.id === socket.id || p.socketId === socket.id);
        if (!player) return;
        player.gold += 50;
        // Sync gold for both players
        io.to(roomId).emit('goldSyncUpdate', {
            players: room.gameState.players.map(p => ({ playerId: p.id || p.socketId, gold: p.gold }))
        });
    });

    // --- Rock Paper Scissors (RPS) Mini-game ---
    socket.on('rpsPlay', (data) => {
        const { move } = data; // move: 'rock', 'paper', or 'scissors' or null
        const roomId = userRooms.get(socket.id);
        if (!roomId) {
            socket.emit('error', { message: 'not_in_room' });
            return;
        }
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('error', { message: 'room_not_found' });
            return;
        }
        if (!room.rps) room.rps = {};
        room.rps[socket.id] = move;
        socket.emit('rpsMoveReceived', { move });
        // Start timer if not already started
        if (!room.rpsTimer) {
            room.rpsTimer = setTimeout(() => {
                finishRPSRound(roomId);
            }, 10000);
        }
        // If both players have played, finish round early
        if (Object.keys(room.rps).length === 2) {
            clearTimeout(room.rpsTimer);
            room.rpsTimer = null;
            finishRPSRound(roomId);
        }
    });

    function finishRPSRound(roomId) {
        const room = rooms.get(roomId);
        if (!room || !room.rps) return;
        const [p1, p2] = room.players;
        const move1 = room.rps[p1.socketId];
        const move2 = room.rps[p2.socketId];
        let winner = 'draw';
        if (move1 && move2) {
            if (move1 === move2) {
                winner = 'draw';
            } else if (
                (move1 === 'rock' && move2 === 'scissors') ||
                (move1 === 'scissors' && move2 === 'paper') ||
                (move1 === 'paper' && move2 === 'rock')
            ) {
                winner = p1.username;
            } else {
                winner = p2.username;
            }
        } else if (move1 && !move2) {
            winner = p1.username;
        } else if (!move1 && move2) {
            winner = p2.username;
        }
        // Award 100 gold to winner
        if (winner !== 'draw') {
            const player = room.gameState.players.find(p => p.username === winner);
            if (player) player.gold += 100;
        }
        // Broadcast result
        io.to(roomId).emit('rpsResult', {
            player1: { username: p1.username, move: move1 },
            player2: { username: p2.username, move: move2 },
            winner
        });
        // Sync gold
        io.to(roomId).emit('goldSyncUpdate', {
            players: room.gameState.players.map(p => ({ playerId: p.id || p.socketId, gold: p.gold }))
        });
        room.rps = {};
        // DO NOT auto-restart or auto-reset here. Wait for explicit rpsReset from clients.
    }

    socket.on('rpsReset', () => {
        const roomId = userRooms.get(socket.id);
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        room.rps = {};
        io.to(roomId).emit('rpsReset');
    });

    // --- Game Over ---
    socket.on('gameOver', (data) => {
        const roomId = userRooms.get(socket.id);
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        if (room.gameState && room.gameState.ended) return; // Prevent duplicate
        room.gameState.ended = true;
        // Clean up intervals
        if (room.miningInterval) {
            clearInterval(room.miningInterval);
            room.miningInterval = null;
        }
        // Broadcast to all players
        io.to(roomId).emit('gameOver', { winner: data.winner });
    });
});

// ===== API Routes =====

// ===== Admin API Routes =====

// Get all users (admin only)
app.get('/api/admin/users', isAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        rank: true,
        createdAt: true,
        updatedAt: true
        // password is intentionally excluded for security
      },
      orderBy: {
        id: 'asc'
      }
    });
    
    res.json(users);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Get single user by ID (admin only)
app.get('/api/admin/users/:id', isAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        rank: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
});

// Update user (admin only)
app.put('/api/admin/users/:id', isAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const { username, rank } = req.body;
    
    // Validate input
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    if (typeof rank !== 'undefined' && (isNaN(rank) || rank < 0)) {
      return res.status(400).json({ error: 'Rank must be a non-negative number' });
    }
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if username is already taken by another user
    if (username !== existingUser.username) {
      const userWithSameUsername = await prisma.user.findUnique({
        where: { username }
      });
      
      if (userWithSameUsername) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }
    
    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        username,
        rank: typeof rank !== 'undefined' ? parseInt(rank) : existingUser.rank
      },
      select: {
        id: true,
        username: true,
        rank: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    res.json(updatedUser);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (admin only)
app.delete('/api/admin/users/:id', isAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Prevent deleting self
    if (userId === req.session.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    // Delete user
    await prisma.user.delete({
      where: { id: userId }
    });
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ===== Regular User API Routes =====

// Signup endpoint
app.post('/api/signup', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码是必填项' });
    }
    
    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });
    
    if (existingUser) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    
    // Count total users to determine if this is the first user
    const userCount = await prisma.user.count();
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user
    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        rank: userCount === 0 ? 10 : 1 // First user gets admin rank (10), others get regular rank (1)
      }
    });
    
    // Set session to log in the user automatically
    req.session.userId = newUser.id;
    
    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      rank: newUser.rank
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: '注册失败，请稍后再试' });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码是必填项' });
    }
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { username }
    });
    
    // User not found or password incorrect
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    // Set session
    req.session.userId = user.id;
    
    res.json({
      id: user.id,
      username: user.username,
      rank: user.rank
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '登录失败，请稍后再试' });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: '退出登录失败' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: '已成功退出登录' });
  });
});

// Get current user endpoint
app.get('/api/user/me', isAuthenticated, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId }
    });
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    res.json({
      id: user.id,
      username: user.username,
      rank: user.rank
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// Add this API endpoint to check for lastRoom
app.get('/api/user/last-room', isAuthenticated, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.session.userId }
        });
        
        if (!user || !user.lastRoom) {
            return res.json({ hasLastRoom: false });
        }
        
        // Check if the room still exists
        const roomExists = rooms.has(user.lastRoom);
        
        res.json({
            hasLastRoom: roomExists,
            roomId: roomExists ? user.lastRoom : null
        });
    } catch (error) {
        console.error('Error checking last room:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize database and start server
async function startServer() {
  try {
    // Check if Prisma schema exists
    console.log('Starting server and initializing database...');
    
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Website "天下太平" is now available!`);
      console.log(`Press Ctrl+C to stop the server.`);
    });
    return httpServer;
  } catch (error) {
    console.error('Failed to start server:', error);
    throw error;
  }
}

// Use this for local development
if (require.main === module) {
  startServer();
}

// Export for Vercel
module.exports = app;
startServer();