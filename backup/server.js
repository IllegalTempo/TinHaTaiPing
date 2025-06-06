const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const prisma = require('./prisma/client');
const { createServer } = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const readline = require('readline');
const SQLiteStore = require('connect-sqlite3')(session);
// Add passport and Google OAuth support
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
// Add dotenv for environment variables
require('dotenv').config();

// Server configuration
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';
let VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true';

// Enable verbose logging for development
if (process.env.NODE_ENV !== 'production') {
  console.log('Enabling verbose logging for development');
  VERBOSE_LOGGING = true;
}

// Server data structures
const rooms = new Map(); // Store game rooms
let onlineUserCount = 0; // Track number of connected users
const connectedUsers = new Set(); // Track connected socket IDs
const userRooms = new Map(); // Map socket IDs to room IDs

// Game mode configurations
const gameModes = {
  classic: {
    name: "Classic",
    description: "Standard game mode with balanced gameplay.",
    initialGold: 500,
    miningRate: 50,
    unitStats: {
      miner: { health: 100, speed: 1.0, cost: 100 },
      soldier: { health: 200, damage: 10, speed: 1.0, cost: 200 },
      barrier: { health: 300, cost: 50 }
    }
  },
  insane: {
    name: "Insane",
    description: "Fast-paced chaos with powerful units and rapid resource generation.",
    initialGold: 1000,
    miningRate: 100,
    unitStats: {
      miner: { health: 80, speed: 1.5, cost: 100 },
      soldier: { health: 250, damage: 20, speed: 1.3, cost: 250 },
      barrier: { health: 500, cost: 75 },
      berserker: { health: 180, damage: 40, speed: 1.8, cost: 400 }
    }
  },
  beta: {
    name: "Beta",
    description: "Experimental features and unique gameplay elements.",
    initialGold: 700,
    miningRate: 65,
    unitStats: {
      miner: { health: 120, speed: 1.0, cost: 120 },
      soldier: { health: 180, damage: 15, speed: 1.0, cost: 220 },
      barrier: { health: 350, cost: 60 },
      scout: { health: 90, damage: 5, speed: 2.0, cost: 150 }
    }
  }
};

// Logging category toggles
const logCategories = {
    CONNECTIONS: true,      // User connections and disconnections
    ROOM_EVENTS: true,      // Room creation, deletion, joining, leaving
    MATCHMAKING: true,      // Matchmaking attempts and results
    GAME_EVENTS: false,     // In-game actions (unit spawning, attacks, etc.)
    PLAYER_READY: false,    // Player ready status changes
    AUTH_EVENTS: false,     // Login, signup, auth events
    ERRORS: true            // Always log errors (can't be disabled)
};

// Server statistics
const serverStats = {
    startTime: new Date(),
    totalConnections: 0,
    matchesMade: 0,
    commandsExecuted: 0,
    errors: 0
};

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;

// Express middleware for parsing requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use('/images', express.static(path.join(__dirname, 'images')));

// Ensure the db directory exists for sessions
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    log('Created db directory for sessions', 'info');
}

// Session configuration with SQLite storage
app.use(session({
    store: new SQLiteStore({ 
        db: 'db/sessions.sqlite'
    }),
    secret: process.env.SESSION_SECRET || 'tianxia-taiping-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Configure Passport
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
    try {
        // Try to find a user with this Google ID
        let user = await prisma.user.findUnique({
            where: { googleId: profile.id }
        });
        
        // If we're linking to an existing account (via the /auth/google/link route)
        if (req.session.linkGoogleToUserId) {
            // If a user with this Google ID already exists
            if (user) {
                return done(null, false, { message: 'This Google account is already linked to another user' });
            }
            
            // Get the user from the session
            const existingUser = await prisma.user.findUnique({
                where: { id: req.session.linkGoogleToUserId }
            });
            
            if (!existingUser) {
                return done(null, false, { message: 'User not found' });
            }
            
            // Update the user with Google info
            user = await prisma.user.update({
                where: { id: existingUser.id },
                data: {
                    googleId: profile.id,
                    email: profile.emails[0].value
                }
            });
            
            // Clear the linking flag
            delete req.session.linkGoogleToUserId;
            
            return done(null, user);
        }
        
        // Handle normal login/registration
        if (user) {
            // User found, log them in
            return done(null, user);
        } else {
            // No user found with this Google ID, create a new account
            // Check if a user with this email already exists
            let existingUserByEmail = null;
            if (profile.emails && profile.emails.length > 0) {
                existingUserByEmail = await prisma.user.findUnique({
                    where: { email: profile.emails[0].value }
                });
            }
            
            if (existingUserByEmail) {
                // Update the existing user with Google ID
                user = await prisma.user.update({
                    where: { id: existingUserByEmail.id },
                    data: { googleId: profile.id }
                });
            } else {
                // Create new user
                // Generate a username based on Google profile
                let username = profile.displayName.toLowerCase().replace(/\s+/g, '');
                
                // Check if username exists and append numbers if needed
                let usernameExists = true;
                let counter = 1;
                let finalUsername = username;
                
                while (usernameExists) {
                    const existingUser = await prisma.user.findUnique({
                        where: { username: finalUsername }
                    });
                    
                    if (existingUser) {
                        finalUsername = `${username}${counter}`;
                        counter++;
                    } else {
                        usernameExists = false;
                    }
                }
                
                // Create the new user
                user = await prisma.user.create({
                    data: {
                        username: finalUsername,
                        googleId: profile.id,
                        email: profile.emails[0].value,
                        password: '!GoogleAuth!', // Placeholder, can't be used to log in
                        role: "PLAYER",
                        elo: 1200
                    }
                });
            }
            
            return done(null, user);
        }
    } catch (error) {
        log(`Google auth error: ${error}`, 'error');
        return done(error);
    }
}));

// Serialize/deserialize user for sessions
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: Number(id) }
        });
        done(null, user);
    } catch (error) {
        done(error);
    }
});

app.use(passport.initialize());
app.use(passport.session());

// Set up Socket.IO for real-time communication
io.on('connection', (socket) => {
    // Increment online user count
    onlineUserCount++;
    connectedUsers.add(socket.id);
    
    log(`User connected: ${socket.id}. Online users: ${onlineUserCount}`, 'info', 'CONNECTIONS');
    io.emit('userCount', { count: onlineUserCount });
    
    // Handle room check requests
    socket.on('checkRoom', (data) => {
        try {
            const { roomId } = data;
            if (!roomId) {
                socket.emit('roomCheckResult', { exists: false, error: 'No room ID provided' });
                return;
            }
            
            log(`Client ${socket.id} checking if room ${roomId} exists`, 'debug');
            const exists = rooms.has(roomId);
            socket.emit('roomCheckResult', { exists });
            
            if (exists) {
                log(`Room ${roomId} exists, notifying client`, 'debug');
            } else {
                log(`Room ${roomId} does not exist`, 'debug');
                
                // If user has this roomId as lastRoom, clear it
                if (socket.request?.session?.userId) {
                    const userId = socket.request.session.userId;
                    prisma.user.findUnique({
                        where: { id: userId }
                    }).then(user => {
                        if (user && user.lastRoom === roomId) {
                            log(`Clearing stale room reference ${roomId} for user ${userId}`, 'info');
                            prisma.user.update({
                                where: { id: userId },
                                data: { lastRoom: null }
                            }).catch(err => log(`Error clearing lastRoom: ${err}`, 'error'));
                        }
                    }).catch(err => log(`Error checking user for lastRoom: ${err}`, 'error'));
                }
            }
        } catch (error) {
            log(`Error checking room: ${error}`, 'error');
            socket.emit('roomCheckResult', { exists: false, error: 'Server error' });
        }
    });
    
    // When user disconnects
    socket.on('disconnect', () => {
        // Decrement online user count
        onlineUserCount = Math.max(0, onlineUserCount - 1);
        connectedUsers.delete(socket.id);
        
        // Handle user leaving a room
        const roomId = userRooms.get(socket.id);
        if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
                // Find the player
                const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
                if (playerIndex !== -1) {
                    // Mark player as disconnected
                    room.players[playerIndex].disconnected = true;
                    room.players[playerIndex].socketId = null;
                    
                    // Notify other players in the room
                    socket.to(roomId).emit('playerList', {
                        players: room.players.filter(p => !p.disconnected || p.socketId === socket.id)
                    });
                    
                    log(`Player ${socket.id} disconnected from room ${roomId}`, 'info', 'CONNECTIONS');
                }
            }
            
            // Remove the user from the room mapping
            userRooms.delete(socket.id);
        }
        
        log(`User disconnected: ${socket.id}. Online users: ${onlineUserCount}`, 'info', 'CONNECTIONS');
        io.emit('userCount', { count: onlineUserCount });
    });
    
    // Handle joining a room
    socket.on('joinRoom', async (data) => {
        try {
            const { roomId, username } = data;
            
            // Validate input
            if (!roomId) {
                socket.emit('error', { message: 'Room ID is required' });
                return;
            }
            
            let userId = null;
            
            // Get user ID from session if authenticated
            if (socket.request.session && socket.request.session.userId) {
                userId = socket.request.session.userId;
                
                const user = await prisma.user.findUnique({
                    where: { id: userId }
                });
                
                if (user) {
                    // Update user's lastRoom
                    await prisma.user.update({
                        where: { id: userId },
                        data: { lastRoom: roomId }
                    });
                }
            }
            
            // Check if room exists
            let room = rooms.get(roomId);
            
            // Create room if it doesn't exist
            if (!room) {
                room = {
                    Started: false,
                    gameMode: 'classic', // Default game mode
                    players: [{
                        socketId: socket.id,
                        username: username || 'Player1',
                        isHost: true,
                        userId: userId,
                        disconnected: false
                    }],
                    serverGameState: {
                        started: false,
                        gold: {},
                        units: [],
                        hp: {},
                        lastUpdateTime: Date.now()
                    }
                };
                
                rooms.set(roomId, room);
                log(`Room created: ${roomId}`, 'info', 'ROOM_EVENTS');
            } else {
                // Check if player is already in the room
                const existingPlayer = room.players.find(p => 
                    p.userId === userId || 
                    p.socketId === socket.id || 
                    (username && p.username === username)
                );
                
                if (existingPlayer) {
                    // Update existing player's socket ID and connection status
                    existingPlayer.socketId = socket.id;
                    existingPlayer.disconnected = false;
                    log(`Player ${username || socket.id} reconnected to room ${roomId}`, 'info', 'ROOM_EVENTS');
        } else {
                    // Add new player to the room
            room.players.push({ 
                socketId: socket.id,
                        username: username || `Player${room.players.length + 1}`,
                        isHost: false,
                        userId: userId,
                        disconnected: false
                    });
                    log(`Player ${username || socket.id} joined room ${roomId}`, 'info', 'ROOM_EVENTS');
                }
            }
            
            // Join the socket.io room
            socket.join(roomId);
        userRooms.set(socket.id, roomId);
        
            // Send room data to all clients in the room
            io.to(roomId).emit('playerList', {
                players: room.players.filter(p => !p.disconnected),
                gameMode: room.gameMode
            });
            
            // Notify the client that they've joined successfully
            socket.emit('roomJoined', {
                roomId,
                isHost: room.players.find(p => p.socketId === socket.id)?.isHost || false,
                gameMode: room.gameMode
            });
            
            // If the game has already started, notify the client
            if (room.Started) {
                socket.emit('gameStarted', { gameState: room.gameState });
            }
        } catch (error) {
            log(`Error joining room: ${error}`, 'error');
            socket.emit('error', { message: 'Failed to join room' });
        }
    });
    
    // Handle unit movement updates from clients
    socket.on('unitMove', (data) => {
        const { unitId, x, y } = data;
        const roomId = userRooms.get(socket.id);
        if (!roomId) return;
        
        const room = rooms.get(roomId);
        if (!room || !room.gameState) return;
        
        // Find the unit in server-side state
        const unitIndex = room.serverGameState.units.findIndex(u => u.id === unitId);
        if (unitIndex === -1) return;
        
        // Validate that this player owns the unit (anti-cheat)
        const unit = room.serverGameState.units[unitIndex];
        if (unit.playerId !== socket.id) {
            log(`Rejected move - Player ${socket.id} tried to move unit owned by ${unit.playerId}`, 'warn');
            return;
        }
        
        // Update position in server state
        room.serverGameState.units[unitIndex].x = x;
        room.serverGameState.units[unitIndex].y = y;
        
        // Also update in game state
        const gameUnitIndex = room.gameState.units.findIndex(u => u.id === unitId);
        if (gameUnitIndex !== -1) {
            room.gameState.units[gameUnitIndex].x = x;
            room.gameState.units[gameUnitIndex].y = y;
        }
        
        // Broadcast move to all clients
        io.to(roomId).emit('unitMoved', { unitId, x, y });
    });

    // Handle unit attack events
    socket.on('unitAttack', (data) => {
        const { attackerUnitId, targetUnitId, damage } = data;
        const roomId = userRooms.get(socket.id);
        if (!roomId) return;
        
        const room = rooms.get(roomId);
        if (!room || !room.gameState) return;
        
        // Find both units in server state
        const attacker = room.serverGameState.units.find(u => u.id === attackerUnitId);
        const target = room.serverGameState.units.find(u => u.id === targetUnitId);
        
        if (!attacker || !target) return;
        
        // Validate that this player owns the attacking unit
        if (attacker.playerId !== socket.id) {
            log(`Rejected attack - Player ${socket.id} tried to use unit owned by ${attacker.playerId}`, 'warn');
            return;
        }
        
        // Server-side damage calculation based on unit stats
        const gameMode = room.gameMode || 'classic';
        const modeConfig = gameModes[gameMode] || gameModes.classic;
        const unitStats = modeConfig.unitStats[attacker.type] || {};
        
        // Use server-side damage value instead of client value
        const serverDamage = unitStats.damage || 10;
        
        // Apply damage to target unit
        target.health -= serverDamage;
        
        // Check if unit is destroyed
        if (target.health <= 0) {
            // Remove unit from server state
            room.serverGameState.units = room.serverGameState.units.filter(u => u.id !== targetUnitId);
            // Also remove from game state
            room.gameState.units = room.gameState.units.filter(u => u.id !== targetUnitId);
            
            // Broadcast unit destruction
            io.to(roomId).emit('unitDestroyed', { unitId: targetUnitId });
            log(`Unit ${targetUnitId} destroyed by ${attackerUnitId}`, 'debug');
        } else {
            // Broadcast damage
            io.to(roomId).emit('unitDamaged', { 
                unitId: targetUnitId, 
                health: target.health,
                damageAmount: serverDamage,
                attackerId: attackerUnitId
            });
        }
    });

    // Add handler for setting game mode
    socket.on('setGameMode', (data) => {
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
            socket.emit('error', { message: 'only_host_can_change_mode' });
            return;
        }
        
        // Check if game already started
        if (room.Started) {
            socket.emit('error', { message: 'cannot_change_mode_after_start' });
            return;
        }
        
        // Update game mode
        const newMode = data.mode || 'classic';
        room.gameMode = newMode;
        
        // Notify all players in the room
        io.to(roomId).emit('gameModeChanged', { gameMode: newMode });
        
        log(`Game mode changed to ${newMode} in room ${roomId}`, 'info');
    });

    // Add a new handler for player ready status
    socket.on('toggleReady', () => {
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
        
        // Find player in the room
        const player = room.players.find(p => p.socketId === socket.id);
        if (!player) {
            socket.emit('error', { message: 'player_not_found' });
                return;
        }
        
        // Toggle ready status
        player.ready = !player.ready;
        log(`Player ${player.username} set ready status to ${player.ready} in room ${roomId}`, 'debug');
        
        // Notify all players of the updated status
        io.to(roomId).emit('playerList', {
            players: room.players.filter(p => !p.disconnected),
            gameMode: room.gameMode
        });
        
        // Check if all players are ready
        const allReady = room.players.length >= 2 && room.players.every(p => p.ready);
        io.to(roomId).emit('allPlayersReady', { ready: allReady });
    });
});

// ===== Middleware Functions =====

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Admin authorization middleware
const isAdmin = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId }
    });
    
    if (!user || user.role !== "ADMIN") {
      return res.status(403).json({ error: 'Admin permission required' });
    }
    
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ===== API Routes =====

// ===== Admin API Routes =====

// Get all users (admin only)
app.get('/api/admin/users', isAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        elo: true,
        banStatus: true,
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
        role: true,
        elo: true,
        banStatus: true,
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
    
    const { username, role, elo } = req.body;
    
    // Validate input
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    // Validate role
    if (role && !["ADMIN", "PLAYER"].includes(role)) {
      return res.status(400).json({ error: 'Role must be either ADMIN or PLAYER' });
    }
    
    if (typeof elo !== 'undefined' && (isNaN(elo) || elo < 0)) {
      return res.status(400).json({ error: 'ELO must be a non-negative number' });
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
    
    // Prepare update data
    const updateData = {
      username,
      ...(role && { role }),
      ...(typeof elo !== 'undefined' && { elo: parseInt(elo) })
    };
    
    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        role: true,
        elo: true,
        banStatus: true,
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
        role: userCount === 0 ? "ADMIN" : "PLAYER", // First user gets ADMIN role, others get PLAYER role
        elo: 1200
      }
    });
    
    // Set session to log in the user automatically
    req.session.userId = newUser.id;
    
    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      role: newUser.role,
      elo: newUser.elo
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
    
    // Check if user is banned
    if (user.banStatus === "BANNED") {
      return res.status(403).json({ error: '您的账户已被封禁' });
    }
    
    // Set session
    req.session.userId = user.id;
    
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      elo: user.elo
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
      role: user.role,
      elo: user.elo
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// Add this API endpoint to clear lastRoom
app.post('/api/user/clear-last-room', isAuthenticated, async (req, res) => {
    try {
        // Update user to clear lastRoom field
        await prisma.user.update({
            where: { id: req.session.userId },
            data: { lastRoom: null }
        });
        
        log(`Cleared lastRoom for user ID ${req.session.userId}`, 'info');
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing lastRoom:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Existing /api/user/last-room endpoint update to better check room existence
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
        
        // Check if the room has this user as a player
        let isInRoom = false;
        if (roomExists) {
            const room = rooms.get(user.lastRoom);
            isInRoom = room.players.some(p => 
                p.userId === req.session.userId || 
                p.username === user.username
            );
            
            // If room exists but user is not in it, clear the lastRoom reference
            if (!isInRoom) {
                await prisma.user.update({
                    where: { id: req.session.userId },
                    data: { lastRoom: null }
                });
                log(`User ${req.session.userId} not found in room ${user.lastRoom}, cleared lastRoom reference`, 'info');
            }
        } else {
            // Room doesn't exist anymore, clear the lastRoom field
            await prisma.user.update({
                where: { id: req.session.userId },
                data: { lastRoom: null }
            });
            log(`Room ${user.lastRoom} no longer exists, cleared lastRoom for user ${req.session.userId}`, 'info');
        }
        
        // Detailed logging to debug matchmaking
        log(`Last room check for user ${req.session.userId}: roomId=${user.lastRoom}, exists=${roomExists}, isInRoom=${isInRoom}`, 'verbose');
        
        res.json({
            hasLastRoom: roomExists && isInRoom,
            roomId: (roomExists && isInRoom) ? user.lastRoom : null
        });
    } catch (error) {
        console.error('Error checking last room:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get current user info
app.get('/api/me', isAuthenticated, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return user info without password
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      elo: user.elo,
      banStatus: user.banStatus,
      lastRoom: user.lastRoom
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Friend system API routes
app.post('/api/friends/request', isAuthenticated, async (req, res) => {
  try {
    const { targetUsername } = req.body;
    const senderId = req.session.userId;

    // Find target user
    const targetUser = await prisma.user.findUnique({
      where: { username: targetUsername }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if sending request to self
    if (targetUser.id === senderId) {
      return res.status(400).json({ error: 'You cannot send a friend request to yourself' });
    }

    // Check if friendship already exists
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId, receiverId: targetUser.id },
          { senderId: targetUser.id, receiverId: senderId }
        ]
      }
    });

    if (existingFriendship) {
      return res.status(400).json({ error: 'Friend request already exists' });
    }

    // Create friendship
    const friendship = await prisma.friendship.create({
      data: {
        senderId,
        receiverId: targetUser.id,
        status: 'pending'
      }
    });

    res.status(201).json(friendship);
  } catch (error) {
    console.error('Error sending friend request:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

app.get('/api/friends', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;

    // Get all accepted friendships where the user is either sender or receiver
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: userId, status: 'accepted' },
          { receiverId: userId, status: 'accepted' }
        ]
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            rank: true
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            rank: true
          }
        }
      }
    });

    // Format the response
    const friends = friendships.map(friendship => {
      const friend = friendship.senderId === userId 
        ? friendship.receiver 
        : friendship.sender;
      
      return {
        friendshipId: friendship.id,
        userId: friend.id,
        username: friend.username,
        rank: friend.rank
      };
    });

    res.json(friends);
  } catch (error) {
    console.error('Error getting friends:', error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
});

app.get('/api/friends/requests', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;

    // Get all pending friend requests received by the user
    const friendRequests = await prisma.friendship.findMany({
      where: {
        receiverId: userId,
        status: 'pending'
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            rank: true
          }
        }
      }
    });

    // Format the response
    const requests = friendRequests.map(request => ({
      requestId: request.id,
      from: {
        userId: request.sender.id,
        username: request.sender.username,
        rank: request.sender.rank
      },
      createdAt: request.createdAt
    }));

    res.json(requests);
  } catch (error) {
    console.error('Error getting friend requests:', error);
    res.status(500).json({ error: 'Failed to get friend requests' });
  }
});

app.post('/api/friends/respond', isAuthenticated, async (req, res) => {
  try {
    const { requestId, action } = req.body;
    const userId = req.session.userId;

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    // Find the request
    const request = await prisma.friendship.findUnique({
      where: { id: parseInt(requestId) }
    });

    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    // Verify the user is the receiver of this request
    if (request.receiverId !== userId) {
      return res.status(403).json({ error: 'Not authorized to respond to this request' });
    }

    // Update the request
    const updatedRequest = await prisma.friendship.update({
      where: { id: parseInt(requestId) },
      data: { status: action === 'accept' ? 'accepted' : 'rejected' }
    });

    res.json(updatedRequest);
  } catch (error) {
    console.error('Error responding to friend request:', error);
    res.status(500).json({ error: 'Failed to respond to friend request' });
  }
});

app.delete('/api/friends/:friendshipId', isAuthenticated, async (req, res) => {
  try {
    const { friendshipId } = req.params;
    const userId = req.session.userId;

    // Find the friendship
    const friendship = await prisma.friendship.findUnique({
      where: { id: parseInt(friendshipId) }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    // Check if user is part of this friendship
    if (friendship.senderId !== userId && friendship.receiverId !== userId) {
      return res.status(403).json({ error: 'Not authorized to remove this friendship' });
    }

    // Delete the friendship
    await prisma.friendship.delete({
      where: { id: parseInt(friendshipId) }
    });

    res.json({ message: 'Friend removed successfully' });
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// Friend duel API route
app.post('/api/friends/duel', isAuthenticated, async (req, res) => {
  try {
    const { friendId } = req.body;
    const userId = req.session.userId;

    // Verify the friendship exists and is accepted
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: parseInt(friendId), status: 'accepted' },
          { senderId: parseInt(friendId), receiverId: userId, status: 'accepted' }
        ]
      }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'This person is not your friend' });
    }

    // Create a new room for the duel
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Return the room ID to redirect the user
    res.json({ roomId });
  } catch (error) {
    console.error('Error initiating friend duel:', error);
    res.status(500).json({ error: 'Failed to initiate duel' });
  }
});

// Open pairing system API endpoints
app.post('/api/pairing/join', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { eloMin, eloMax } = req.body;
    
    // Check if user is already in queue
    const existingQueue = await prisma.pairingQueue.findUnique({
      where: { userId }
    });
    
    if (existingQueue) {
      return res.status(400).json({ error: 'You are already in the matchmaking queue' });
    }
    
    // Add user to queue
    const queue = await prisma.pairingQueue.create({
      data: {
        userId,
        eloMin: eloMin ? parseInt(eloMin) : null,
        eloMax: eloMax ? parseInt(eloMax) : null
      }
    });
    
    // Try to find a match immediately
    const matchResult = await tryMatchmaking(userId);
    
    // If match found, no need to create a room as it's already done in tryMatchmaking
    if (matchResult) {
      log(`Match found for user ${userId}, room ${matchResult.roomId} created`, 'success');
      serverStats.matchesMade++;
      
      // Room is already created in tryMatchmaking, just update users' lastRoom
      await prisma.user.update({
        where: { id: matchResult.player1.id },
        data: { lastRoom: matchResult.roomId }
      });
      
      await prisma.user.update({
        where: { id: matchResult.player2.id },
        data: { lastRoom: matchResult.roomId }
      });
      
      log(`Created room ${matchResult.roomId} for matched players: ${matchResult.player1.username} vs ${matchResult.player2.username}`, 'success');
      
      // Start matchmaking interval if not already running
      setupMatchmakingInterval();
      
      return res.status(201).json({ 
        message: 'Match found! Redirecting to game room...',
        matched: true,
        roomId: matchResult.roomId
      });
    } else {
      log(`No immediate match found for user ${userId}, added to queue`, 'info');
      
      // Schedule continuous matchmaking attempts if not already running
      setupMatchmakingInterval();
      
      return res.status(201).json({ 
        message: 'Joined matchmaking queue',
        matched: false
      });
    }
  } catch (error) {
    log(`Error joining matchmaking queue: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to join matchmaking queue' });
  }
});

app.delete('/api/pairing/leave', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Remove from queue
    await prisma.pairingQueue.deleteMany({
      where: { userId }
    });
    
    res.json({ message: 'Left matchmaking queue' });
  } catch (error) {
    log(`Error leaving matchmaking queue: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to leave matchmaking queue' });
  }
});

app.get('/api/pairing/status', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Check if in queue
    const queueEntry = await prisma.pairingQueue.findUnique({
      where: { userId }
    });
    
    if (!queueEntry) {
      return res.json({ inQueue: false });
    }
    
    res.json({
      inQueue: true,
      joinedAt: queueEntry.joinedAt,
      eloMin: queueEntry.eloMin,
      eloMax: queueEntry.eloMax
    });
  } catch (error) {
    log(`Error checking queue status: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to check queue status' });
  }
});

// Function to try matchmaking for a user
async function tryMatchmaking(userId) {
  try {
    // Get user's queue entry and ELO
    const userQueue = await prisma.pairingQueue.findUnique({
      where: { userId },
      include: { user: true }
    });
    
    if (!userQueue) return null;
    
    const userElo = userQueue.user.elo;
    
    // Find potential match based on ELO and time in queue
    const potentialMatches = await prisma.pairingQueue.findMany({
      where: {
        userId: { not: userId },
        // Apply ELO filters if specified by either user
        ...(userQueue.eloMin !== null && {
          user: { elo: { gte: userQueue.eloMin }}
        }),
        ...(userQueue.eloMax !== null && {
          user: { elo: { lte: userQueue.eloMax }}
        })
      },
      include: { user: true },
      orderBy: { joinedAt: 'asc' }
    });
    
    // Filter matches further based on matched user's ELO preferences
    const compatibleMatches = potentialMatches.filter(match => {
      const matchEloMin = match.eloMin;
      const matchEloMax = match.eloMax;
      
      // Check if this user's ELO falls within the match's ELO range (if specified)
      const withinMatchMinElo = matchEloMin === null || userElo >= matchEloMin;
      const withinMatchMaxElo = matchEloMax === null || userElo <= matchEloMax;
      
      return withinMatchMinElo && withinMatchMaxElo;
    });
    
    if (compatibleMatches.length === 0) {
      return null; // No matches found
    }
    
    // Get the first compatible match (oldest in queue)
    const match = compatibleMatches[0];
    
    // Create a game room
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Get default game mode configuration
    const gameMode = 'classic'; // Default game mode for matchmaking
    
    // Use default values if gameModes is not available
    let modeConfig = {
        initialGold: 500,
        miningRate: 50,
        unitStats: {
            miner: { health: 100, speed: 1.0, cost: 100 },
            soldier: { health: 200, damage: 10, speed: 1.0, cost: 200 },
            barrier: { health: 300, cost: 50 }
        }
    };
    
    // Try to get the game mode config if available
    try {
        if (typeof gameModes !== 'undefined' && gameModes[gameMode]) {
            modeConfig = gameModes[gameMode];
            log(`Using ${gameMode} game mode configuration`, 'debug');
        } else {
            log(`GameModes not defined or ${gameMode} mode not found, using default config`, 'warn');
        }
    } catch (e) {
        log(`Error accessing gameModes: ${e}, using default config`, 'error');
    }
    
    // Create match record
    await prisma.match.create({
      data: {
        player1Id: userId,
        player2Id: match.userId,
        completed: false
      }
    });
    
    // Remove both users from the queue
    await prisma.pairingQueue.deleteMany({
      where: {
        userId: { in: [userId, match.userId] }
      }
    });
    
    // Properly initialize room data structure
    const room = {
      Started: false,
      gameMode: gameMode,
      players: [
        {
          socketId: null, // Will be set when they join the room
          username: userQueue.user.username,
          isHost: true,
          userId: userId,
          disconnected: false
        },
        {
          socketId: null, // Will be set when they join the room
          username: match.user.username,
          isHost: false,
          userId: match.userId,
          disconnected: false
        }
      ],
      // Initialize server-side game state structure
      serverGameState: {
        started: false,
        gold: {},
        units: [],
        hp: {},
        lastUpdateTime: Date.now()
      }
    };
    
    // Store room in memory
    rooms.set(roomId, room);
    
    // Find all socket connections for both users and notify them
    // We need to find the sockets associated with these users to send them notifications
    const matchResult = {
      roomId,
      player1: {
        id: userId,
        elo: userElo,
        username: userQueue.user.username
      },
      player2: {
        id: match.userId,
        elo: match.user.elo,
        username: match.user.username
      }
    };
    
    // Update both users' lastRoom
    await prisma.user.update({
      where: { id: userId },
      data: { lastRoom: roomId }
    });
    
    await prisma.user.update({
      where: { id: match.userId },
      data: { lastRoom: roomId }
    });
    
    // Find socket connections for both players
    const player1Sockets = [];
    const player2Sockets = [];
    
    // This is inefficient, but we need to search through all connected sockets
    // In a production app, you'd maintain a mapping of userId -> socketIds
    io.sockets.sockets.forEach(socket => {
      if (socket.request?.session?.userId === userId) {
        player1Sockets.push(socket.id);
      } else if (socket.request?.session?.userId === match.userId) {
        player2Sockets.push(socket.id);
      }
    });
    
    log(`Notifying matched players: ${player1Sockets.length} sockets for player1, ${player2Sockets.length} sockets for player2`, 'debug', 'MATCHMAKING');
    
    // Emit to all sockets for player 1
    player1Sockets.forEach(socketId => {
      io.to(socketId).emit('matchFound', {
        roomId,
        opponent: match.user.username,
        isHost: true
      });
    });
    
    // Emit to all sockets for player 2
    player2Sockets.forEach(socketId => {
      io.to(socketId).emit('matchFound', {
        roomId,
        opponent: userQueue.user.username,
        isHost: false
      });
    });
    
    log(`Match created: ${userQueue.user.username} (${userId}) vs ${match.user.username} (${match.userId})`, 'debug', 'MATCHMAKING');
    
    return matchResult;
  } catch (error) {
    log(`Error in matchmaking: ${error}`, 'error');
    return null;
  }
}

// Admin ban/unban API
app.post('/api/admin/users/:id/ban', isAdmin, async (req, res) => {
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
    
    // Don't allow banning admins or self
    if (existingUser.role === "ADMIN" || userId === req.session.userId) {
      return res.status(400).json({ error: 'Cannot ban administrators or yourself' });
    }
    
    // Ban user
    await prisma.user.update({
      where: { id: userId },
      data: { banStatus: "BANNED" }
    });
    
    res.json({ message: 'User banned successfully' });
  } catch (error) {
    log(`Ban user error: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

app.post('/api/admin/users/:id/unban', isAdmin, async (req, res) => {
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
    
    // Unban user
    await prisma.user.update({
      where: { id: userId },
      data: { banStatus: "CLEAR" }
    });
    
    res.json({ message: 'User unbanned successfully' });
  } catch (error) {
    log(`Unban user error: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

// Google OAuth routes
app.get('/auth/google', (req, res, next) => {
    // Save the original referrer for returning to the correct page
    if (req.headers.referer) {
        req.session.returnTo = req.headers.referer;
    }
    
    // Log authentication attempt
    log(`Google auth initiated from: ${req.headers.referer || 'unknown'}`, 'info');
    
    // Proceed with Google authentication
    passport.authenticate('google', { 
        scope: ['profile', 'email'],
        prompt: 'select_account' // Always show account selector
    })(req, res, next);
});

app.get('/auth/google/callback', (req, res, next) => {
    log(`Google auth callback received with query: ${JSON.stringify(req.query)}`, 'debug');
    
    // Handle the callback with error handling
    passport.authenticate('google', { 
        failureRedirect: '/login.html?error=google-login-failed',
        failWithError: true
    }, (err, user, info) => {
        // Handle errors
        if (err) {
            log(`Google auth error: ${err.message}`, 'error');
            return res.redirect('/login.html?error=google-login-error');
        }
        
        if (!user) {
            const errorMsg = info?.message || 'Unknown authentication failure';
            log(`Google auth failed: ${errorMsg}`, 'warn');
            return res.redirect(`/login.html?error=${encodeURIComponent(errorMsg)}`);
        }
        
        // Log in the user by setting the session
        req.login(user, (loginErr) => {
            if (loginErr) {
                log(`Login error after Google auth: ${loginErr.message}`, 'error');
                return res.redirect('/login.html?error=session-error');
            }
            
            // Set session userId
            req.session.userId = user.id;
            log(`Google auth successful for user ID: ${user.id}`, 'info');
            
            // Check if there's a return path in the session
            if (req.session.returnTo) {
                const returnUrl = req.session.returnTo;
                delete req.session.returnTo;
                return res.redirect(returnUrl);
            }
            
            // Default redirect to dashboard
            res.redirect('/dashboard.html');
        });
    })(req, res, next);
});

// Route for linking existing account with Google
app.get('/auth/google/link', isAuthenticated, (req, res) => {
    // Store the user ID in the session to connect after Google auth
    req.session.linkGoogleToUserId = req.session.userId;
    
    // Store return path
    if (req.headers.referer) {
        req.session.returnTo = req.headers.referer;
    }
    
    log(`Google account linking initiated for user ID: ${req.session.userId}`, 'info');
    
    // Redirect to Google auth with a special 'link' parameter
    passport.authenticate('google', { 
        scope: ['profile', 'email'],
        prompt: 'select_account', // Always show account selector
        state: 'linking-account'
    })(req, res);
});

// Separate callback handler for account linking
app.get('/auth/google/link/callback', (req, res, next) => {
    passport.authenticate('google', { 
        failureRedirect: '/dashboard.html?error=google-link-failed',
        failWithError: true
    }, (err, user, info) => {
        // Handle errors
        if (err) {
            log(`Google link error: ${err.message}`, 'error');
            return res.redirect('/dashboard.html?error=google-link-error');
        }
        
        if (!user) {
            const errorMsg = info?.message || 'Unknown linking failure';
            log(`Google link failed: ${errorMsg}`, 'warn');
            return res.redirect(`/dashboard.html?error=${encodeURIComponent(errorMsg)}`);
        }
        
        // Make sure the user ID is in the session
        req.session.userId = user.id;
        log(`Google account linked successfully for user ID: ${user.id}`, 'info');
        
        // Check if there's a return path
        if (req.session.returnTo) {
            const returnUrl = req.session.returnTo;
            delete req.session.returnTo;
            return res.redirect(`${returnUrl}?success=google-linked`);
        }
        
        // Default redirect to dashboard with success message
        res.redirect('/dashboard.html?success=google-linked');
    })(req, res, next);
});

// Check Google authentication status
app.get('/api/auth/google/status', (req, res) => {
  res.json({
    isAuthenticated: !!req.user,
    user: req.user ? {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role
    } : null
  });
});

// Unlink Google account
app.post('/api/auth/google/unlink', isAuthenticated, async (req, res) => {
  try {
    // Update user to remove Google ID
    await prisma.user.update({
      where: { id: req.session.userId },
      data: { 
        googleId: null,
        email: null  // Optionally remove the email too if it came from Google
      }
    });
    
    res.json({ success: true, message: 'Google account unlinked successfully' });
  } catch (error) {
    log(`Error unlinking Google account: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to unlink Google account' });
    }
});

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Add a new API endpoint to get the current user count
app.get('/api/users/count', (req, res) => {
    res.json({ count: onlineUserCount });
});

// Add an endpoint to manually check for matches (for debugging and testing)
app.post('/api/pairing/check-matches', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        
        // Check if user is in queue
        const queueEntry = await prisma.pairingQueue.findUnique({
            where: { userId }
        });
        
        if (!queueEntry) {
            return res.status(400).json({ error: 'You are not in the matchmaking queue' });
        }
        
        // Try to find a match
        const matchResult = await tryMatchmaking(userId);
        
        if (matchResult) {
            // Create a room for the match
            const roomId = matchResult.roomId;
            
            // Update both users' lastRoom
            await prisma.user.update({
                where: { id: matchResult.player1.id },
                data: { lastRoom: roomId }
            });
            
            await prisma.user.update({
                where: { id: matchResult.player2.id },
                data: { lastRoom: roomId }
            });
            
            // Create the room in memory
            const room = {
                Started: false,
                gameMode: 'classic', // Default game mode
                players: [
                    {
                        socketId: null, // Will be set when they join the room
                        username: matchResult.player1.username || `Player1`,
                        isHost: true,
                        userId: matchResult.player1.id
                    },
                    {
                        socketId: null, // Will be set when they join the room
                        username: matchResult.player2.username || `Player2`,
                        isHost: false,
                        userId: matchResult.player2.id
                    }
                ],
                // Initialize server-side game state structure
                serverGameState: {
                    started: false,
                    gold: {},
                    units: [],
                    hp: {},
                    lastUpdateTime: Date.now()
                }
            };
            
            // Store room in memory
            rooms.set(roomId, room);
            
            // Find all socket connections for both users and notify them
            // We need to find the sockets associated with these users to send them notifications
            const matchResult = {
                roomId,
                player1: {
                    id: matchResult.player1.id,
                    elo: matchResult.player1.elo,
                    username: matchResult.player1.username
                },
                player2: {
                    id: matchResult.player2.id,
                    elo: matchResult.player2.elo,
                    username: matchResult.player2.username
                }
            };
            
            // Update both users' lastRoom
            await prisma.user.update({
                where: { id: matchResult.player1.id },
                data: { lastRoom: roomId }
            });
            
            await prisma.user.update({
                where: { id: matchResult.player2.id },
                data: { lastRoom: roomId }
            });
            
            // Find socket connections for both players
            const player1Sockets = [];
            const player2Sockets = [];
            
            // This is inefficient, but we need to search through all connected sockets
            // In a production app, you'd maintain a mapping of userId -> socketIds
            io.sockets.sockets.forEach(socket => {
                if (socket.request?.session?.userId === matchResult.player1.id) {
                    player1Sockets.push(socket.id);
                } else if (socket.request?.session?.userId === matchResult.player2.id) {
                    player2Sockets.push(socket.id);
                }
            });
            
            log(`Notifying matched players: ${player1Sockets.length} sockets for player1, ${player2Sockets.length} sockets for player2`, 'debug', 'MATCHMAKING');
            
            // Emit to all sockets for player 1
            player1Sockets.forEach(socketId => {
                io.to(socketId).emit('matchFound', {
                    roomId,
                    opponent: matchResult.player2.username,
                    isHost: true
                });
            });
            
            // Emit to all sockets for player 2
            player2Sockets.forEach(socketId => {
                io.to(socketId).emit('matchFound', {
                    roomId,
                    opponent: matchResult.player1.username,
                    isHost: false
                });
            });
            
            log(`Match created: ${matchResult.player1.username} (${matchResult.player1.id}) vs ${matchResult.player2.username} (${matchResult.player2.id})`, 'debug', 'MATCHMAKING');
            
            return res.status(201).json(matchResult);
        } else {
            log(`No match found for user ${userId}, added to queue`, 'info');
            
            // Schedule continuous matchmaking attempts if not already running
            setupMatchmakingInterval();
            
            return res.status(201).json({
                message: 'Joined matchmaking queue',
                matched: false
            });
        }
    } catch (error) {
        log(`Error checking matches: ${error}`, 'error');
        res.status(500).json({ error: 'Failed to check matches' });
    }
});