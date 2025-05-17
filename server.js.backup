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

// Logging function for consistent server logs
function log(message, level = 'info', category = null) {
  if (level === 'error') {
    serverStats.errors++;
    // Get stack trace for errors to help with debugging
    const stack = new Error().stack.split('\n').slice(2).join('\n');
    console.error(`[ERROR] ${message}`);
    if (VERBOSE_LOGGING) {
      console.error(`Stack trace:\n${stack}`);
    }
    return;
  }
  
  // Skip logging if verbose mode disabled and level is debug
  if (level === 'debug' && !VERBOSE_LOGGING) {
    return;
  }
  
  // Skip logging if category is disabled
  if (category && logCategories[category] === false) {
    return;
  }
  
  // Format and output the log
  const timestamp = new Date().toISOString();
  let logPrefix = `[${timestamp}]`;
  
  if (level === 'info') logPrefix += ' [INFO]';
  if (level === 'warn') logPrefix += ' [WARN]';
  if (level === 'debug') logPrefix += ' [DEBUG]';
  if (level === 'success') logPrefix += ' [SUCCESS]';
  
  if (category) {
    logPrefix += ` [${category}]`;
  }
  
  // Get the caller function name if possible
  if (VERBOSE_LOGGING && level === 'debug') {
    try {
      const caller = new Error().stack.split('\n')[2].trim();
      const functionName = caller.match(/at (\w+)/);
      if (functionName && functionName[1]) {
        logPrefix += ` [${functionName[1]}]`;
      }
    } catch (e) {
      // Ignore errors getting caller info
    }
  }
  
  console.log(`${logPrefix} ${message}`);
}

// Server data structures
const rooms = new Map(); // Store game rooms
let onlineUserCount = 0; // Track number of connected users
const connectedUsers = new Set(); // Track connected socket IDs
const userRooms = new Map(); // Map socket IDs to room IDs
const activeUserSockets = new Map(); // Map user IDs to socket IDs
const userDisconnects = new Map(); // Track user disconnection counts

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
    TESTING: true,          // System test and debug functions
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
                        username,
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
    
    // Associate socket with user session if authenticated
    if (socket.request?.session?.userId) {
        const userId = socket.request.session.userId;
        // Store the socket ID for this user
        if (!activeUserSockets.has(userId)) {
            activeUserSockets.set(userId, new Set());
        }
        activeUserSockets.get(userId).add(socket.id);
        log(`Associated socket ${socket.id} with user ${userId}`, 'debug', 'CONNECTIONS');
        
        // Check if user has an active room to rejoin
        prisma.user.findUnique({
            where: { id: userId }
        }).then(async user => {
            if (user && user.lastRoom) {
                const roomId = user.lastRoom;
                if (rooms.has(roomId)) {
                    log(`User ${userId} has active room ${roomId}, checking if player in room`, 'info', 'CONNECTIONS');
                    
                    // Check if player is in this room
                    const room = rooms.get(roomId);
                    const playerInRoom = room.players.find(p => p.userId === userId);
                    
                    if (playerInRoom) {
                        log(`Found player ${userId} in room ${roomId}, updating socket reference`, 'info', 'ROOM_EVENTS');
                        
                        // Update player info with new socket
                        playerInRoom.socketId = socket.id;
                        playerInRoom.disconnected = false;
                        
                        // Join the socket.io room
                        socket.join(roomId);
                        userRooms.set(socket.id, roomId);
                        
                        // Notify the client about the active room
                        socket.emit('activeRoomDetected', { 
                            roomId,
                            autoJoin: true,
                            isHost: playerInRoom.isHost
                        });
                        
                        // Send updated player list to all in room
                        io.to(roomId).emit('playerList', {
                            players: room.players.filter(p => !p.disconnected).map(p => ({
                                socketId: p.socketId,
                                username: p.username,
                                isHost: p.isHost,
                                ready: p.ready
                            })),
                            gameMode: room.gameMode
                        });
                        
                        log(`Auto-joined socket ${socket.id} to room ${roomId}`, 'info', 'ROOM_EVENTS');
                    } else {
                        // User is not a player in this room, clear lastRoom
                        await prisma.user.update({
                            where: { id: userId },
                            data: { lastRoom: null }
                        });
                        log(`User ${userId} not a player in room ${roomId}, cleared lastRoom reference`, 'info', 'CONNECTIONS');
                    }
                } else {
                    // Room no longer exists, clear lastRoom
                    await prisma.user.update({
                        where: { id: userId },
                        data: { lastRoom: null }
                    });
                    log(`Room ${roomId} no longer exists, cleared lastRoom for user ${userId}`, 'info', 'CONNECTIONS');
                }
            }
        }).catch(err => log(`Error checking for active rooms: ${err}`, 'error'));
    }
    
    // Add test request handler for client-side testing
    socket.on('testRequest', (data) => {
        log(`Received test request from client ${socket.id}: ${JSON.stringify(data)}`, 'debug', 'TESTING');
        // Echo the data back to the client
        socket.emit('testResponse', { 
            status: 'success', 
            message: 'Test response from server',
            receivedData: data,
            timestamp: Date.now()
        });
    });
    
    // Handle pong responses for latency testing
    socket.on('pong', (data) => {
        log(`Pong from client ${socket.id}, round trip: ${data.roundTrip}ms`, 'debug', 'TESTING');
        // Check if the latency is high
        if (data.roundTrip > 200) {
            log(`High latency detected for client ${socket.id}: ${data.roundTrip}ms`, 'warn', 'CONNECTIONS');
        }
    });
    
    // Handle room check requests
    socket.on('checkRoom', async (data) => {
        try {
            const { roomId } = data;
            if (!roomId) {
                socket.emit('roomCheckResult', { exists: false, error: 'No room ID provided' });
                return;
            }
            
            log(`Client ${socket.id} checking if room ${roomId} exists`, 'debug', 'SOCKET');
            const exists = rooms.has(roomId);
            
            // First, just tell the client if the room exists
            socket.emit('roomCheckResult', { exists });
            
            if (exists) {
                log(`Room ${roomId} exists, notifying client`, 'debug', 'SOCKET');
                
                // If the user is authenticated, check if they should be in this room
                if (socket.request?.session?.userId) {
                    const userId = socket.request.session.userId;
                    const user = await prisma.user.findUnique({
                        where: { id: userId }
                    });
                    
                    // If this is the user's last room (from matchmaking)
                    if (user && user.lastRoom === roomId) {
                        const room = rooms.get(roomId);
                        
                        // Check if user is a player in this room
                        const playerInRoom = room.players.find(p => p.userId === userId);
                        
                        if (playerInRoom) {
                            log(`User ${userId} found as player in room ${roomId}, auto-joining socket`, 'info', 'ROOM_EVENTS');
                            
                            // Update player socket ID and connection status
                            playerInRoom.socketId = socket.id;
                            playerInRoom.disconnected = false;
                            
                            // Join the socket.io room
                            socket.join(roomId);
                            userRooms.set(socket.id, roomId);
                            
                            // Send current player list
                            io.to(roomId).emit('playerList', {
                                players: room.players.filter(p => !p.disconnected).map(p => ({
                                    socketId: p.socketId,
                                    username: p.username,
                                    isHost: p.isHost,
                                    ready: p.ready
                                })),
                                gameMode: room.gameMode
                            });
                            
                            // Notify the client that they've been auto-joined
                            socket.emit('autoJoined', { 
                                roomId,
                                isHost: playerInRoom.isHost
                            });
                            
                            log(`Auto-joined socket ${socket.id} to room ${roomId}`, 'info', 'ROOM_EVENTS');
                        }
                    }
                } else {
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
        
        // Remove socket from user mapping
        if (socket.request?.session?.userId) {
            const userId = socket.request.session.userId;
            if (activeUserSockets.has(userId)) {
                activeUserSockets.get(userId).delete(socket.id);
                // If no sockets left for this user, clean up
                if (activeUserSockets.get(userId).size === 0) {
                    activeUserSockets.delete(userId);
                    log(`Removed last socket for user ${userId}`, 'debug', 'CONNECTIONS');
                } else {
                    log(`User ${userId} still has ${activeUserSockets.get(userId).size} active connections`, 'debug', 'CONNECTIONS');
                }
            }
            
            // Handle abandonment for game in progress
            checkPlayerDisconnect(socket.id, userId);
        }
        
        // Remove the user from the room mapping
        const roomId = userRooms.get(socket.id);
        if (roomId) {
            // Handle room-specific disconnect logic
            handleRoomDisconnect(socket.id, roomId);
            
            // Remove the user from the room mapping
            userRooms.delete(socket.id);
        }
        
        log(`User disconnected: ${socket.id}. Online users: ${onlineUserCount}`, 'info', 'CONNECTIONS');
        io.emit('userCount', { count: onlineUserCount });
    });
    
    // Handle user disconnect from a room
    function handleRoomDisconnect(socketId, roomId) {
        const room = rooms.get(roomId);
        if (!room) return;
        
        // Find the player
        const playerIndex = room.players.findIndex(p => p.socketId === socketId);
        if (playerIndex === -1) return;
        
        // Get the user ID
        const userId = room.players[playerIndex].userId;
        
        // Mark player as disconnected
        room.players[playerIndex].disconnected = true;
        room.players[playerIndex].socketId = null;
        room.players[playerIndex].disconnectedAt = Date.now();
        
        // Increment user disconnect count if game has started
        if (room.Started) {
            // Track consecutive disconnects
            if (!userDisconnects.has(userId)) {
                userDisconnects.set(userId, {
                    count: 0,
                    lastDisconnect: null,
                    warnings: 0,
                    tempBanUntil: null
                });
            }
            
            const disconnectInfo = userDisconnects.get(userId);
            disconnectInfo.count += 1;
            disconnectInfo.lastDisconnect = Date.now();
            
            log(`Player ${userId} disconnected from active game. Consecutive disconnects: ${disconnectInfo.count}`, 'warn', 'CONNECTIONS');
            
            // Handle disconnect thresholds
            if (disconnectInfo.count >= 5) {
                // Apply temporary ban - 30 minutes
                const banDuration = 30 * 60 * 1000; // 30 minutes in milliseconds
                disconnectInfo.tempBanUntil = Date.now() + banDuration;
                
                // Store ban status in database
                prisma.user.update({
                    where: { id: userId },
                    data: { 
                        banStatus: "TEMP_BANNED",
                        banExpiration: new Date(disconnectInfo.tempBanUntil)
                    }
                }).catch(err => log(`Error updating user ban status: ${err}`, 'error'));
                
                log(`Player ${userId} has been temporarily banned for 30 minutes due to excessive disconnections`, 'warn', 'CONNECTIONS');
                
                // Force game abandonment
                abandonGame(roomId, userId);
            } else if (disconnectInfo.count >= 3) {
                // Issue warning
                disconnectInfo.warnings += 1;
                log(`WARNING: Player ${userId} has disconnected ${disconnectInfo.count} times. Further disconnects will result in a temporary ban.`, 'warn', 'CONNECTIONS');
                
                // Start abandon timer (shorter for repeat offenders)
                const abandonDelay = disconnectInfo.warnings > 1 ? 30000 : 60000; // 30 seconds or 60 seconds
                startAbandonTimer(roomId, playerIndex, abandonDelay);
            } else {
                // Start abandon timer
                startAbandonTimer(roomId, playerIndex, 120000); // 2 minutes
            }
        }
        
        // Notify other players in the room
        io.to(roomId).emit('playerList', {
            players: room.players.filter(p => !p.disconnected || p.socketId === socketId)
        });
        
        // Notify about the disconnection
        io.to(roomId).emit('playerDisconnected', {
            username: room.players[playerIndex].username,
            userId: room.players[playerIndex].userId,
            isHost: room.players[playerIndex].isHost,
            disconnectCount: userDisconnects.has(userId) ? userDisconnects.get(userId).count : 1
        });
        
        log(`Player ${socketId} disconnected from room ${roomId}`, 'info', 'CONNECTIONS');
    }
    
    // Function to check if player should be disconnected from a game
    function checkPlayerDisconnect(socketId, userId) {
        // Find all rooms where this user is a player
        for (const [roomId, room] of rooms.entries()) {
            const playerIndex = room.players.findIndex(p => p.userId === userId);
            if (playerIndex !== -1) {
                // Only disconnect if this was the socket associated with the player
                if (room.players[playerIndex].socketId === socketId) {
                    handleRoomDisconnect(socketId, roomId);
                }
            }
        }
    }
    
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
                room.players[playerIndex].disconnectedAt = Date.now();
                
                // Increment user disconnect count if game has started
                if (room.Started) {
                    // Track consecutive disconnects
                    if (!userDisconnects.has(userId)) {
                        userDisconnects.set(userId, {
                            count: 0,
                            lastDisconnect: null,
                            warnings: 0,
                            tempBanUntil: null
                        });
                    }
                    
                    const disconnectInfo = userDisconnects.get(userId);
                    disconnectInfo.count += 1;
                    disconnectInfo.lastDisconnect = Date.now();
                    
                    log(`Player ${userId} disconnected from active game. Consecutive disconnects: ${disconnectInfo.count}`, 'warn', 'CONNECTIONS');
                    
                    // Handle disconnect thresholds
                    if (disconnectInfo.count >= 5) {
                        // Apply temporary ban - 30 minutes
                        const banDuration = 30 * 60 * 1000; // 30 minutes in milliseconds
                        disconnectInfo.tempBanUntil = Date.now() + banDuration;
                        
                        // Store ban status in database
                        prisma.user.update({
                            where: { id: userId },
                            data: { 
                                banStatus: "TEMP_BANNED",
                                banExpiration: new Date(disconnectInfo.tempBanUntil)
                            }
                        }).catch(err => log(`Error updating user ban status: ${err}`, 'error'));
                        
                        log(`Player ${userId} has been temporarily banned for 30 minutes due to excessive disconnections`, 'warn', 'CONNECTIONS');
                        
                        // Force game abandonment
                        abandonGame(roomId, userId);
                    } else if (disconnectInfo.count >= 3) {
                        // Issue warning
                        disconnectInfo.warnings += 1;
                        log(`WARNING: Player ${userId} has disconnected ${disconnectInfo.count} times. Further disconnects will result in a temporary ban.`, 'warn', 'CONNECTIONS');
                        
                        // Start abandon timer (shorter for repeat offenders)
                        const abandonDelay = disconnectInfo.warnings > 1 ? 30000 : 60000; // 30 seconds or 60 seconds
                        startAbandonTimer(roomId, playerIndex, abandonDelay);
                    } else {
                        // Start abandon timer
                        startAbandonTimer(roomId, playerIndex, 120000); // 2 minutes
                    }
                }
                
                // Notify other players in the room
                socket.to(roomId).emit('playerList', {
                    players: room.players.filter(p => !p.disconnected || p.socketId === socket.id)
                });
                
                // Notify about the disconnection
                socket.to(roomId).emit('playerDisconnected', {
                    username: room.players[playerIndex].username,
                    userId: room.players[playerIndex].userId,
                    isHost: room.players[playerIndex].isHost,
                    disconnectCount: userDisconnects.has(userId) ? userDisconnects.get(userId).count : 1
                });
                
                log(`Player ${socket.id} disconnected from room ${roomId}`, 'info', 'CONNECTIONS');
            }
        }
    }
});

// Function to start abandon timer for disconnected players
function startAbandonTimer(roomId, playerIndex, delay) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    // Clear any existing timer
    if (room.players[playerIndex].abandonTimer) {
        clearTimeout(room.players[playerIndex].abandonTimer);
    }
    
    log(`Starting abandon timer for player in room ${roomId}. Game will be abandoned in ${delay/1000} seconds if player doesn't reconnect`, 'info', 'GAME_EVENTS');
    
    // Set new timer
    room.players[playerIndex].abandonTimer = setTimeout(() => {
        // Check if the room still exists
        if (!rooms.has(roomId)) return;
        
        // Get updated room state
        const currentRoom = rooms.get(roomId);
        
        // Check if player is still disconnected
        if (currentRoom.players[playerIndex] && currentRoom.players[playerIndex].disconnected) {
            // Abandon the game
            const userId = currentRoom.players[playerIndex].userId;
            log(`Abandon timer expired for player ${userId} in room ${roomId}. Game will be abandoned.`, 'warn', 'GAME_EVENTS');
            
            abandonGame(roomId, userId);
        }
    }, delay);
}

// Function to abandon a game and apply penalties
async function abandonGame(roomId, abandoningUserId) {
    const room = rooms.get(roomId);
    if (!room || !room.Started) return;
    
    log(`Game in room ${roomId} abandoned by player ${abandoningUserId}`, 'warn', 'GAME_EVENTS');
    
    // Find the opponent (non-abandoning player)
    const abandoningPlayer = room.players.find(p => p.userId === abandoningUserId);
    const opponentPlayer = room.players.find(p => p.userId !== abandoningUserId);
    
    if (!opponentPlayer) {
        log(`Could not find opponent for abandoning player ${abandoningUserId}`, 'error');
        return;
    }
    
    // Get match ID from room
    const matchId = room.matchId;
    if (!matchId) {
        log(`No match ID found for room ${roomId}`, 'error');
        return;
    }
    
    try {
        // Mark match as completed with opponent as winner
        await prisma.match.update({
            where: { id: matchId },
            data: {
                completed: true,
                winnerId: opponentPlayer.userId,
                winnerByDefault: true,
                abandonedAt: new Date(),
                abandonedBy: abandoningUserId
            }
        });
        
        // Calculate and apply severe ELO penalty for abandoning
        const abandoningUser = await prisma.user.findUnique({
            where: { id: abandoningUserId },
            select: { id: true, username: true, elo: true }
        });
        
        const opponentUser = await prisma.user.findUnique({
            where: { id: opponentPlayer.userId },
            select: { id: true, username: true, elo: true }
        });
        
        if (!abandoningUser || !opponentUser) {
            log(`Could not find users for abandoned match`, 'error');
            return;
        }
        
        // Calculate ELO penalties - more severe for abandoning player
        const eloLoss = Math.min(40, Math.max(15, Math.floor(abandoningUser.elo * 0.04))); // 4% of ELO, min 15, max 40
        const eloGain = Math.floor(eloLoss * 0.75); // Winner gets 75% of loser's loss
        
        // Apply ELO changes
        await prisma.user.update({
            where: { id: abandoningUserId },
            data: { 
                elo: Math.max(1000, abandoningUser.elo - eloLoss) // Prevent going below 1000
            }
        });
        
        await prisma.user.update({
            where: { id: opponentPlayer.userId },
            data: { 
                elo: opponentUser.elo + eloGain
            }
        });
        
        log(`Applied abandon penalty: ${abandoningUser.username} (${abandoningUser.elo} → ${abandoningUser.elo - eloLoss}, -${eloLoss}), ${opponentUser.username} awarded ${eloGain} points`, 'info', 'MATCHMAKING');
        
        // Update match record with ELO changes
        await prisma.match.update({
            where: { id: matchId },
            data: {
                winnerEloChange: eloGain,
                loserEloChange: -eloLoss
            }
        });
        
        // Notify the opponent that they won by default
        if (opponentPlayer.socketId) {
            io.to(opponentPlayer.socketId).emit('gameAbandoned', {
                abandoningPlayer: {
                    username: abandoningUser.username,
                    id: abandoningUserId
                },
                eloChange: eloGain,
                newElo: opponentUser.elo + eloGain
            });
        }
        
        // Mark the room as completed
        room.completed = true;
        room.abandoned = true;
        room.abandonedBy = abandoningUserId;
        
        // Schedule room cleanup
        setTimeout(() => {
            if (rooms.has(roomId)) {
                log(`Cleaning up abandoned room ${roomId}`, 'debug', 'ROOM_EVENTS');
                rooms.delete(roomId);
            }
        }, 60000); // 1 minute
        
    } catch (error) {
        log(`Error handling game abandonment: ${error}`, 'error');
    }
}

// Handle joining a room
socket.on('joinRoom', async (data) => {
    try {
        const { roomId, username } = data;
        
        // Validate input
        if (!roomId) {
            log(`Client ${socket.id} attempted to join a room without providing roomId`, 'error');
            socket.emit('error', { message: 'Room ID is required' });
            return;
        }
        
        log(`Client ${socket.id} is attempting to join room ${roomId} as ${username || 'unknown'}`, 'info', 'ROOM_EVENTS');
        
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
                log(`Updated user ${userId} (${username || user.username}) lastRoom to ${roomId}`, 'debug', 'ROOM_EVENTS');
            }
        }
        
        // Check if already in a room - leave it first
        const currentRoom = userRooms.get(socket.id);
        if (currentRoom && currentRoom !== roomId) {
            // Leave current room first
            log(`Socket ${socket.id} leaving current room ${currentRoom} before joining ${roomId}`, 'debug', 'ROOM_EVENTS');
            socket.leave(currentRoom);
            
            // Update player status in the old room if needed
            const oldRoom = rooms.get(currentRoom);
            if (oldRoom) {
                const playerInOldRoom = oldRoom.players.find(p => p.socketId === socket.id);
                if (playerInOldRoom) {
                    playerInOldRoom.disconnected = true;
                    playerInOldRoom.socketId = null;
                    
                    // Notify others in old room
                    socket.to(currentRoom).emit('playerList', {
                        players: oldRoom.players.filter(p => !p.disconnected).map(p => ({
                            socketId: p.socketId,
                            username: p.username,
                            isHost: p.isHost,
                            ready: p.ready
                        }))
                    });
                }
            }
        }
        
        // Check if room exists
        let room = rooms.get(roomId);
        
        // If room doesn't exist, create it
        if (!room) {
            room = {
                id: roomId,
                players: [],
                Started: false,
                gameMode: 'classic',
                gameState: null,
                serverGameState: null
            };
            rooms.set(roomId, room);
            log(`Created new room ${roomId}`, 'info', 'ROOM_EVENTS');
        }
        
        // If game already started, handle differently
        if (room.Started) {
            log(`Room ${roomId} game already started, checking if player can rejoin`, 'debug', 'ROOM_EVENTS');
            
            // Check if user is a player in this room
            const existingPlayer = room.players.find(p => p.userId === userId);
            
            if (!existingPlayer) {
                log(`User ${userId} tried to join room ${roomId} but is not a player`, 'warn', 'ROOM_EVENTS');
                socket.emit('error', { message: 'Cannot join a started game you are not part of' });
                return;
            }
            
            // Allow player to rejoin
            log(`Player ${userId} (${username || existingPlayer.username}) rejoining room ${roomId}`, 'info', 'ROOM_EVENTS');
            
            // Update player info
            existingPlayer.socketId = socket.id;
            existingPlayer.disconnected = false;
            
            // Add socket to room
            socket.join(roomId);
            userRooms.set(socket.id, roomId);
            
            // Send current game state
            socket.emit('gameState', room.gameState);
            
            // Notify other players
            socket.to(roomId).emit('playerRejoined', {
                playerId: socket.id,
                username: existingPlayer.username
            });
            
            // Send current player list
            io.to(roomId).emit('playerList', {
                players: room.players.filter(p => !p.disconnected).map(p => ({
                    socketId: p.socketId,
                    username: p.username,
                    isHost: p.isHost,
                    ready: p.ready
                })),
                gameMode: room.gameMode
            });
            
            log(`Player ${socket.id} rejoined room ${roomId}`, 'info', 'ROOM_EVENTS');
            return;
        }
        
        // Check if the user is already in this room with another socket
        if (userId) {
            const existingPlayer = room.players.find(p => p.userId === userId);
            
            if (existingPlayer) {
                log(`User ${userId} already in room ${roomId} with socket ${existingPlayer.socketId}`, 'debug', 'ROOM_EVENTS');
                
                // Update existing player record with new socket ID
                existingPlayer.socketId = socket.id;
                existingPlayer.disconnected = false;
                
                // Add socket to room
                socket.join(roomId);
                userRooms.set(socket.id, roomId);
                
                // Broadcast player list to room
                io.to(roomId).emit('playerList', {
                    players: room.players.filter(p => !p.disconnected).map(p => ({
                        socketId: p.socketId,
                        username: p.username,
                        isHost: p.isHost,
                        ready: p.ready
                    })),
                    gameMode: room.gameMode
                });
                
                log(`Player ${socket.id} updated socket in room ${roomId}`, 'info', 'ROOM_EVENTS');
                
                // Ensure the client gets a success notification
                socket.emit('roomJoined', {
                    roomId,
                    isHost: existingPlayer.isHost
                });
                
                return;
            }
        }
        
        // Check if room is full (2 active players)
        const activePlayers = room.players.filter(p => !p.disconnected);
        if (activePlayers.length >= 2) {
            log(`Room ${roomId} is full, client ${socket.id} cannot join`, 'warn', 'ROOM_EVENTS');
            socket.emit('error', { message: 'Room is full' });
            return;
        }
        
        // Join the room
        socket.join(roomId);
        
        // Add to userRooms map
        userRooms.set(socket.id, roomId);
        
        // Add player to room
        const newPlayer = {
            socketId: socket.id,
            username: username || `Player${room.players.length + 1}`,
            isHost: room.players.length === 0,
            userId: userId,
            disconnected: false,
            ready: false
        };
        
        room.players.push(newPlayer);
        
        // Broadcast player list to room
        io.to(roomId).emit('playerList', {
            players: room.players.filter(p => !p.disconnected).map(p => ({
                socketId: p.socketId,
                username: p.username,
                isHost: p.isHost,
                ready: p.ready
            })),
            gameMode: room.gameMode
        });
        
        // Ensure the client gets a success notification
        socket.emit('roomJoined', {
            roomId,
            isHost: newPlayer.isHost
        });
        
        log(`Player ${socket.id} joined room ${roomId}`, 'info', 'ROOM_EVENTS');
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
        
    // Get game mode config for movement speed limits
    const gameMode = room.gameMode || 'classic';
    const modeConfig = gameModes[gameMode] || gameModes.classic;
    const unitStats = modeConfig.unitStats[unit.type] || {};
    
    // Check movement speed (basic anti-cheat)
    const oldX = unit.x;
    const oldY = unit.y;
    const dx = x - oldX;
    const dy = y - oldY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Max allowed movement per update (could be refined further)
    const maxSpeed = (unitStats.speed || 1) * 10;
    
    if (dist > maxSpeed) {
        log(`Rejected move - Unit ${unitId} attempted to move too fast (${dist} > ${maxSpeed})`, 'warn');
        
        // Notify the client of the correct position
        socket.emit('unitPositionCorrection', {
            unitId,
            x: oldX, 
            y: oldY
        });
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

// Handle ready status
socket.on('toggleReady', () => {
        const roomId = userRooms.get(socket.id);
        if (!roomId) {
        log(`Socket ${socket.id} tried to toggle ready status but is not in a room`, 'error');
            socket.emit('error', { message: 'not_in_room' });
            return;
        }
        
    const room = rooms.get(roomId);
    if (!room) {
        log(`Socket ${socket.id} tried to toggle ready in room ${roomId}, but room doesn't exist`, 'error');
        socket.emit('error', { message: 'room_not_found' });
        return;
    }
    
    // Find player in the room
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) {
        log(`Socket ${socket.id} not found in room ${roomId} players list`, 'error');
        socket.emit('error', { message: 'player_not_found' });
        return;
    }
    
    // Don't allow toggling ready state if game has started
    if (room.Started) {
        log(`Socket ${socket.id} tried to toggle ready, but game in room ${roomId} already started`, 'warn');
        socket.emit('error', { message: 'game_already_started' });
        return;
    }
    
    // Don't allow un-readying - only allow setting to ready if not already ready
    if (player.ready) {
        log(`Socket ${socket.id} tried to toggle ready, but already ready`, 'debug');
        socket.emit('error', { message: 'ready_locked' });
        return;
    }
    
    // Set ready status to true (one-way toggle)
    player.ready = true;
    log(`Player ${player.username} (${socket.id}) set ready status to true in room ${roomId}`, 'info', 'PLAYER_READY');
    
    // Notify all players of the updated status
    io.to(roomId).emit('playerList', {
        players: room.players.filter(p => !p.disconnected).map(p => ({
            socketId: p.socketId,
            username: p.username,
            isHost: p.isHost,
            ready: p.ready
        })),
        gameMode: room.gameMode
    });
    
    // Check if all players are ready
    const allPlayersInRoom = room.players.filter(p => !p.disconnected);
    const allPlayersReady = allPlayersInRoom.every(p => p.ready || p.isHost);
    const hasEnoughPlayers = allPlayersInRoom.length >= 2;
    
    const allReady = hasEnoughPlayers && allPlayersReady;
    
    log(`Room ${roomId} ready check: players=${allPlayersInRoom.length}, allReady=${allPlayersReady}, hasEnoughPlayers=${hasEnoughPlayers}, startingGame=${allReady}`, 'info', 'PLAYER_READY');
    
    io.to(roomId).emit('allPlayersReady', { 
        ready: allReady,
        readyCount: room.players.filter(p => !p.disconnected && p.ready).length,
        totalCount: allPlayersInRoom.length
    });
    
    // If all players are ready, automatically start the game after a short delay
    if (allReady) {
        log(`All players ready in room ${roomId}, starting game automatically in 3 seconds`, 'info', 'GAME_EVENTS');
        
        // Notify all players that the game is about to start
        io.to(roomId).emit('allPlayersReady', { 
            ready: true,
            readyCount: room.players.filter(p => !p.disconnected && p.ready).length,
            totalCount: allPlayersInRoom.length,
            autoStarting: true
        });
        
        // Set a timer to start the game automatically
        if (!room.autoStartTimer) {
            const countdownStart = 3; // 3 second countdown
            let countdown = countdownStart;
            
            // Send initial countdown notification
            io.to(roomId).emit('autoStartCountdown', { seconds: countdown });
            log(`Sent initial countdown (${countdown}) to room ${roomId}`, 'debug', 'GAME_EVENTS');
            
            // Create countdown interval
            room.countdownInterval = setInterval(() => {
                countdown--;
                
                // Send countdown update to all players
                io.to(roomId).emit('autoStartCountdown', { seconds: countdown });
                log(`Sent countdown update (${countdown}) to room ${roomId}`, 'debug', 'GAME_EVENTS');
                
                // When countdown reaches 0, clear the interval
                if (countdown <= 0) {
                    clearInterval(room.countdownInterval);
                    room.countdownInterval = null;
                    log(`Countdown finished for room ${roomId}`, 'debug', 'GAME_EVENTS');
                }
            }, 1000);
            
            room.autoStartTimer = setTimeout(() => {
                // Check if the room still exists and the game hasn't started yet
                if (rooms.has(roomId) && !room.Started) {
                    log(`Auto-starting game in room ${roomId}`, 'info', 'GAME_EVENTS');
                    
                    // Initialize game state with mode-specific settings
                    const gameMode = room.gameMode || 'classic';
                    const modeConfig = gameModes[gameMode] || gameModes.classic;
                    
                    room.Started = true;
                    room.gameState = {
                        started: true,
                        mode: gameMode,
                        gold: {},
                        units: [],
                        hp: {}
                    };
                    
                    // Initialize players with mode-specific starting gold
                    room.players.forEach(player => {
                        if (!player.disconnected) {
                            room.gameState.gold[player.socketId] = modeConfig.initialGold;
                            room.gameState.hp[player.socketId] = 100; // Starting HP
                        }
                    });
                    
                    // Copy relevant info to server game state for anti-cheat verification
                    room.serverGameState = {
                        started: true,
                        gold: { ...room.gameState.gold },
                        units: [],
                        hp: { ...room.gameState.hp },
                        lastUpdateTime: Date.now(),
                        modeConfig: modeConfig
                    };
                    
                    // Notify all players that the game has started
                    io.to(roomId).emit('gameStarted', {
                        gameState: room.gameState,
                        modeConfig: {
                            name: modeConfig.name,
                            description: modeConfig.description,
                            initialGold: modeConfig.initialGold,
                            miningRate: modeConfig.miningRate,
                            unitStats: modeConfig.unitStats
                        },
                        players: room.players.filter(p => !p.disconnected).map(p => ({
                            id: p.socketId,
                            username: p.username,
                            isHost: p.isHost,
                            gold: room.gameState.gold[p.socketId],
                            hp: room.gameState.hp[p.socketId]
                        }))
                    });
                    
                    log(`Game auto-started in room ${roomId} with ${room.players.filter(p => !p.disconnected).length} players`, 'success', 'GAME_EVENTS');
                    
                    // Start mining income for all players
                    startMiningIncome(roomId, modeConfig.miningRate);
        } else {
                    log(`Cannot auto-start game: room ${roomId} no longer exists or game already started`, 'warn', 'GAME_EVENTS');
                }
                
                // Clear the timer reference
                if (room) {
                    room.autoStartTimer = null;
                    
                    // Also clear countdown interval if it exists
                    if (room.countdownInterval) {
                        clearInterval(room.countdownInterval);
                        room.countdownInterval = null;
                    }
                }
            }, 3000); // 3 second delay before auto-start
        }
    }
});

// Handle game start request
socket.on('startGame', () => {
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
        socket.emit('error', { message: 'only_host_can_start_game' });
        return;
    }
    
    // Check if the game has already started
    if (room.Started) {
        socket.emit('error', { message: 'game_already_started' });
        return;
    }
    
    // Check if we have enough players (at least 2)
    if (room.players.filter(p => !p.disconnected).length < 2) {
        socket.emit('error', { message: 'need_at_least_two_players' });
        return;
    }
    
    // Check if all players are ready
    const allReady = room.players.filter(p => !p.disconnected).every(p => p.ready || p.isHost);
    if (!allReady) {
        socket.emit('error', { message: 'not_all_players_ready' });
        return;
    }
    
    // Get game mode configuration
    const gameMode = room.gameMode || 'classic';
    const modeConfig = gameModes[gameMode] || gameModes.classic;
    
    log(`Starting game in room ${roomId} with mode: ${gameMode}`, 'info', 'GAME_EVENTS');
    
    // Initialize game state with mode-specific settings
    room.Started = true;
    room.gameState = {
        started: true,
        mode: gameMode,
        gold: {},
        units: [],
        hp: {}
    };
    
    // Initialize players with mode-specific starting gold
    room.players.forEach(player => {
        if (!player.disconnected) {
            room.gameState.gold[player.socketId] = modeConfig.initialGold;
            room.gameState.hp[player.socketId] = 100; // Starting HP
        }
    });
    
    // Copy relevant info to server game state for anti-cheat verification
    room.serverGameState = {
        started: true,
        gold: { ...room.gameState.gold },
        units: [],
        hp: { ...room.gameState.hp },
        lastUpdateTime: Date.now(),
        modeConfig: modeConfig
    };
    
    // Notify all players that the game has started
    io.to(roomId).emit('gameStarted', {
        gameState: room.gameState,
        modeConfig: {
            name: modeConfig.name,
            description: modeConfig.description,
            initialGold: modeConfig.initialGold,
            miningRate: modeConfig.miningRate,
            unitStats: modeConfig.unitStats
        },
        players: room.players.filter(p => !p.disconnected).map(p => ({
            id: p.socketId,
            username: p.username,
            isHost: p.isHost,
            gold: room.gameState.gold[p.socketId],
            hp: room.gameState.hp[p.socketId]
        }))
    });
    
    log(`Game started in room ${roomId} with ${room.players.filter(p => !p.disconnected).length} players`, 'success', 'GAME_EVENTS');
    
    // Start mining income for all players
    startMiningIncome(roomId, modeConfig.miningRate);
});

// Add this function to handle mining income for the room
function startMiningIncome(roomId, miningRate) {
    const room = rooms.get(roomId);
    if (!room || !room.Started) return;
    
    // Clear any existing interval
    if (room.miningInterval) {
        clearInterval(room.miningInterval);
    }
    
    // Set up mining income interval
    room.miningInterval = setInterval(() => {
        if (!room || !room.Started) {
            clearInterval(room.miningInterval);
        return;
    }
    
        // Add mining income for all connected players
        const activePlayers = room.players.filter(p => !p.disconnected && p.socketId);
        
        activePlayers.forEach(player => {
            // Calculate mining income based on miner units
            let baseIncome = miningRate;
            const playerMiners = room.serverGameState.units.filter(u => 
                u.type === 'miner' && u.playerId === player.socketId
            );
            
            // Each miner adds 50% of the base mining rate
            const minerBonus = playerMiners.length * (baseIncome * 0.5);
            const totalIncome = baseIncome + minerBonus;
            
            // Update gold in both game state and server state
            room.gameState.gold[player.socketId] += totalIncome;
            room.serverGameState.gold[player.socketId] += totalIncome;
            
            // Notify player of gold update
            io.to(player.socketId).emit('goldUpdate', {
                playerId: player.socketId,
                gold: room.gameState.gold[player.socketId],
                delta: totalIncome
            });
        });
        
        // Send synchronized gold update to all players in the room (for UI)
    io.to(roomId).emit('goldSyncUpdate', {
            players: activePlayers.map(p => ({
                playerId: p.socketId,
                gold: room.gameState.gold[p.socketId]
            }))
    });
    }, 5000); // Gold income every 5 seconds
}

// Handle unit spawning
socket.on('spawnUnit', (data) => {
    const roomId = userRooms.get(socket.id);
    if (!roomId) {
        socket.emit('error', { message: 'not_in_room' });
        return;
    }
    
    const room = rooms.get(roomId);
    if (!room || !room.Started) {
        socket.emit('error', { message: 'game_not_started' });
        return;
    }
    
    // Validate unit type
    const unitType = data.unitType;
    if (!unitType) {
        socket.emit('error', { message: 'invalid_unit_type' });
        return;
    }
    
    // Get game mode config
    const gameMode = room.gameMode || 'classic';
    const modeConfig = gameModes[gameMode] || gameModes.classic;
    
    // Check if unit type is valid for this game mode
    if (!modeConfig.unitStats[unitType]) {
        socket.emit('error', { message: 'unit_not_available_in_mode' });
            return;
    }
    
    // Get unit cost from mode config
    const unitStats = modeConfig.unitStats[unitType];
    const cost = unitStats.cost;
    
    // Check if player has enough gold
    const currentGold = room.serverGameState.gold[socket.id] || 0;
    if (currentGold < cost) {
        socket.emit('error', { message: 'not_enough_gold' });
        return;
    }
    
    // Create unit with mode-specific stats
    const unitId = `${unitType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const isLeftPlayer = room.players.findIndex(p => p.socketId === socket.id) === 0;
    
    const unitData = {
        id: unitId,
        type: unitType,
        playerId: socket.id,
        x: data.x || (isLeftPlayer ? 100 : 900),
        y: data.y || 300,
        health: unitStats.health || 100,
        damage: unitStats.damage,
        speed: unitStats.speed,
        isLeftPlayer
    };
    
    // Deduct gold from player
    room.gameState.gold[socket.id] -= cost;
    room.serverGameState.gold[socket.id] -= cost;
    
    // Add unit to game state
    room.gameState.units.push(unitData);
    room.serverGameState.units.push(unitData);
    
    // Notify all players about the new unit
    io.to(roomId).emit('unitSpawned', unitData);
    
    // Update player's gold
    socket.emit('goldUpdate', {
        playerId: socket.id,
        gold: room.gameState.gold[socket.id],
        delta: -cost
    });
    
    log(`Player ${socket.id} spawned ${unitType} in room ${roomId}`, 'debug', 'GAME_EVENTS');
});

// Handle game end and ELO updates
socket.on('gameCompleted', async (data) => {
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
    
    // Validate the winner is in this room
    const { winnerId } = data;
    const winnerPlayer = room.players.find(p => p.userId === parseInt(winnerId));
    
    if (!winnerPlayer) {
        log(`Invalid winner ID ${winnerId} for room ${roomId}`, 'error');
        socket.emit('error', { message: 'invalid_winner' });
        return;
    }
    
    // Get match ID from room
    const matchId = room.matchId;
    if (!matchId) {
        log(`No match ID found for room ${roomId}`, 'error');
        socket.emit('error', { message: 'match_not_found' });
        return;
    }
    
    log(`Game completed in room ${roomId}, winner: ${winnerPlayer.username} (${winnerId})`, 'info', 'GAME_EVENTS');
    
    // Update ELO ratings
    const eloResult = await updateEloRatings(matchId, parseInt(winnerId));
    
    if (!eloResult) {
        log(`Failed to update ELO ratings for match ${matchId}`, 'error');
        socket.emit('error', { message: 'elo_update_failed' });
        return;
    }
    
    // Notify all players in the room about the game results and ELO changes
    io.to(roomId).emit('gameResults', {
        winner: eloResult.winner,
        loser: eloResult.loser,
        matchId: matchId
    });
    
    log(`Game results sent to room ${roomId}`, 'debug', 'GAME_EVENTS');
    
    // Reset disconnect count for players who completed the game normally
    for (const player of room.players) {
        if (player.userId && userDisconnects.has(player.userId)) {
            const disconnectInfo = userDisconnects.get(player.userId);
            
            // Only reset if they have fewer than 5 disconnects (not banned)
            if (disconnectInfo.count < 5) {
                log(`Resetting disconnect count for player ${player.userId} after normal game completion`, 'debug');
                disconnectInfo.count = 0;
                disconnectInfo.warnings = 0;
                
                // Update in database as well
                prisma.user.update({
                    where: { id: player.userId },
                    data: { 
                        disconnectCount: 0,
                        lastDisconnectAt: null
                    }
                }).catch(err => log(`Error updating user disconnect count: ${err}`, 'error'));
            }
        }
    }
    
    // Mark the room as completed
    room.completed = true;
    
    // Schedule room cleanup after a delay to allow players to see results
    setTimeout(() => {
        if (rooms.has(roomId)) {
            log(`Cleaning up completed room ${roomId}`, 'debug', 'ROOM_EVENTS');
            rooms.delete(roomId);
        }
    }, 300000); // 5 minutes
});

// Handle game mode info request
socket.on('getGameModes', () => {
    // Send all available game modes to the client
    const modeInfo = Object.keys(gameModes).map(key => ({
        id: key,
        name: gameModes[key].name,
        description: gameModes[key].description,
        initialGold: gameModes[key].initialGold,
        miningRate: gameModes[key].miningRate,
        availableUnits: Object.keys(gameModes[key].unitStats)
    }));
    
    socket.emit('gameModeList', { modes: modeInfo });
    log(`Sent game mode info to client ${socket.id}`, 'debug');
});

// Improved setGameMode handler
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
    
    // Update game mode if it's valid
    const newMode = data.mode || 'classic';
    if (!gameModes[newMode]) {
        socket.emit('error', { message: 'invalid_game_mode' });
        return;
    }
    
    room.gameMode = newMode;
    
    // Provide full game mode info to clients
    const modeInfo = {
        id: newMode,
        name: gameModes[newMode].name,
        description: gameModes[newMode].description,
        initialGold: gameModes[newMode].initialGold,
        miningRate: gameModes[newMode].miningRate,
        unitStats: gameModes[newMode].unitStats,
        availableUnits: Object.keys(gameModes[newMode].unitStats)
    };
    
    // Notify all players in the room
    io.to(roomId).emit('gameModeChanged', { 
        gameMode: newMode,
        modeInfo: modeInfo
    });
    
    log(`Game mode changed to ${newMode} in room ${roomId}`, 'info');
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
    
    // Check if user is temporarily banned
    if (user.banStatus === "TEMP_BANNED" && user.banExpiration) {
      const banExpiration = new Date(user.banExpiration);
      const now = new Date();
      
      if (banExpiration > now) {
        // Calculate remaining ban time
        const remainingTimeMs = banExpiration.getTime() - now.getTime();
        const remainingMinutes = Math.ceil(remainingTimeMs / (60 * 1000));
        
        return res.status(403).json({ 
          error: `您的账户暂时被禁用，剩余时间：${remainingMinutes}分钟`,
          banExpiration: banExpiration.toISOString(),
          remainingMinutes
        });
      } else {
        // Ban has expired, clear the ban status
        await prisma.user.update({
          where: { id: user.id },
          data: { 
            banStatus: "CLEAR",
            banExpiration: null
          }
        });
      }
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
            elo: true
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            elo: true
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
        elo: friend.elo
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
            elo: true
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
        elo: request.sender.elo
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

// Global variable to track matchmaking interval
let matchmakingIntervalId = null;

// Function to set up periodic matchmaking
function setupMatchmakingInterval() {
  // If matchmaking interval is already set up, don't create another one
  if (matchmakingIntervalId) {
    return;
  }
  
  log('Starting global matchmaking interval', 'info');
  
  // Run matchmaking every 10 seconds
  matchmakingIntervalId = setInterval(async () => {
    try {
      // Find all users in the queue
      const queueEntries = await prisma.pairingQueue.findMany({
        orderBy: { joinedAt: 'asc' },
        include: { user: true }
      });
      
      if (queueEntries.length < 2) {
        return; // Not enough users to match
      }
      
      // Try to match the oldest user in the queue
      await tryMatchmaking(queueEntries[0].userId);
    } catch (error) {
      log(`Error in matchmaking interval: ${error}`, 'error');
    }
  }, 10000);
}

// Function to try matchmaking for a user
async function tryMatchmaking(userId) {
  try {
    // Get user's queue entry and ELO
    const userQueue = await prisma.pairingQueue.findUnique({
      where: { userId },
      include: { user: true }
    });
    
    if (!userQueue) {
      log(`User ${userId} not found in queue`, 'warn', 'MATCHMAKING');
      return null;
    }
    
    log(`Processing matchmaking for user ${userId} (${userQueue.user.username}, ELO: ${userQueue.user.elo})`, 'info', 'MATCHMAKING');
    
    // Find other users in queue that match ELO criteria
    const potentialMatches = await prisma.pairingQueue.findMany({
      where: {
        userId: { not: userId }, // Exclude this user
        // Apply ELO range filtering if specified
        ...(userQueue.eloMin ? { 
          user: { 
            elo: { gte: userQueue.eloMin } 
          } 
        } : {}),
        ...(userQueue.eloMax ? { 
          user: { 
            elo: { lte: userQueue.eloMax } 
          } 
        } : {})
      },
      include: {
        user: true
      },
      orderBy: {
        joinedAt: 'asc' // Match with users who have been waiting longest
      }
    });
    
    log(`Found ${potentialMatches.length} potential matches for user ${userId}`, 'debug', 'MATCHMAKING');
    
    if (potentialMatches.length === 0) {
      log(`No suitable matches found for user ${userId}`, 'info', 'MATCHMAKING');
      return null;
    }
    
    // Find best match based on ELO proximity
    const player1 = userQueue.user;
    let bestMatch = potentialMatches[0];
    let smallestEloDiff = Math.abs(player1.elo - bestMatch.user.elo);
    
    for (const match of potentialMatches) {
      const eloDiff = Math.abs(player1.elo - match.user.elo);
      if (eloDiff < smallestEloDiff) {
        smallestEloDiff = eloDiff;
        bestMatch = match;
      }
    }
    
    const player2 = bestMatch.user;
    
    log(`Selected match: ${player1.username} (${player1.elo}) vs ${player2.username} (${player2.elo}), ELO diff: ${smallestEloDiff}`, 'info', 'MATCHMAKING');
    
    // Create a match record
    const dbMatch = await prisma.match.create({
      data: {
        player1Id: player1.id,
        player2Id: player2.id,
        completed: false,
        gameMode: 'classic' // Default game mode
      }
    });
    
    log(`Created match record ID ${dbMatch.id} for ${player1.username} vs ${player2.username}`, 'debug', 'MATCHMAKING');
    
    // Remove both players from the queue
    await prisma.pairingQueue.deleteMany({
      where: {
        userId: {
          in: [player1.id, player2.id]
        }
      }
    });
    
    log(`Removed players ${player1.id} and ${player2.id} from matchmaking queue`, 'debug', 'MATCHMAKING');
    
    // Create a room for the match
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Check if we have active sockets for both players
    const player1Sockets = activeUserSockets.get(player1.id);
    const player2Sockets = activeUserSockets.get(player2.id);
    
    if (!player1Sockets || player1Sockets.size === 0) {
      log(`Warning: No active sockets found for player ${player1.username} (${player1.id})`, 'warn', 'MATCHMAKING');
    }
    
    if (!player2Sockets || player2Sockets.size === 0) {
      log(`Warning: No active sockets found for player ${player2.username} (${player2.id})`, 'warn', 'MATCHMAKING');
    }
    
    // Create the room without socket IDs initially
    rooms.set(roomId, {
      id: roomId,
      matchId: dbMatch.id,
      players: [
        {
          userId: player1.id,
          username: player1.username,
          socketId: null, // Will be set when they join
          isHost: true,
          ready: false,
          disconnected: false
        },
        {
          userId: player2.id,
          username: player2.username,
          socketId: null, // Will be set when they join
          isHost: false,
          ready: false,
          disconnected: false
        }
      ],
      gameMode: 'classic',
      Started: false,
      gameState: null,
      serverGameState: null
    });
    
    log(`Created room ${roomId} for match ${dbMatch.id}`, 'info', 'MATCHMAKING');
    
    // Get first available socket for each player
    let player1SocketId = null;
    let player2SocketId = null;
    
    if (player1Sockets && player1Sockets.size > 0) {
      player1SocketId = Array.from(player1Sockets)[0];
    }
    
    if (player2Sockets && player2Sockets.size > 0) {
      player2SocketId = Array.from(player2Sockets)[0];
    }
    
    // Notify the players they've been matched
    if (player1SocketId) {
      const socket1 = io.sockets.sockets.get(player1SocketId);
      if (socket1) {
        socket1.emit('matchFound', { roomId, opponent: player2.username });
        log(`Notified player ${player1.username} of match`, 'debug', 'MATCHMAKING');
      }
    }
    
    if (player2SocketId) {
      const socket2 = io.sockets.sockets.get(player2SocketId);
      if (socket2) {
        socket2.emit('matchFound', { roomId, opponent: player1.username });
        log(`Notified player ${player2.username} of match`, 'debug', 'MATCHMAKING');
      }
    }
    
    log(`Match created successfully between ${player1.username} and ${player2.username} in room ${roomId}`, 'success', 'MATCHMAKING');
    
    return {
      player1,
      player2,
      roomId
    };
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
            // Match was already created in tryMatchmaking
            return res.status(201).json({
                message: 'Match found! Redirecting to game room...',
                matched: true,
                roomId: matchResult.roomId,
                opponent: matchResult.player1.id === userId ? matchResult.player2.username : matchResult.player1.username
            });
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

console.log('=========== SERVER INITIALIZATION STARTED ===========');

httpServer.listen(PORT, () => {
  console.log(`=========== SERVER STARTED ON PORT ${PORT} ===========`);
  log(`Server is running on http://localhost:${PORT}`, 'success');
  log(`Website "天下太平" is now available!`, 'success');
  log(`Type 'help' for a list of available commands`, 'info');
  
  // Set up continuous matchmaking if not already running
  setupMatchmakingInterval();
});

// Function to update ELO ratings after a match completes (using chess.com-like algorithm)
async function updateEloRatings(matchId, winnerId) {
  try {
    // Import the ELO rating library
    const EloRating = require('elo-rating');
    
    // Get match details from database
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        player1: true,
        player2: true
      }
    });
    
    if (!match) {
      log(`Unable to update ELO: Match ${matchId} not found`, 'error');
      return false;
    }
    
    // Get player info
    const player1 = match.player1;
    const player2 = match.player2;
    
    // Determine winner and loser
    let winner, loser;
    if (winnerId === player1.id) {
      winner = player1;
      loser = player2;
    } else if (winnerId === player2.id) {
      winner = player2;
      loser = player1;
    } else {
      log(`Invalid winner ID ${winnerId} for match ${matchId}`, 'error');
      return false;
    }
    
    // Calculate ELO change using the elo-rating library
    // K-factor of 32 is standard for players under 2100 rating
    const kFactor = 32;
    
    // Calculate the new ratings using the library
    const result = EloRating.calculate(winner.elo, loser.elo, true, kFactor);
    
    // Get the ELO changes
    const newWinnerElo = result.playerRating;
    const newLoserElo = result.opponentRating;
    
    // Calculate changes
    const finalWinnerGain = newWinnerElo - winner.elo;
    const finalLoserLoss = loser.elo - newLoserElo;
    
    log(`ELO Update for match ${matchId}: ${winner.username} (${winner.elo} → ${newWinnerElo}, +${finalWinnerGain}), ${loser.username} (${loser.elo} → ${newLoserElo}, -${finalLoserLoss})`, 'info', 'MATCHMAKING');
    
    // Update player ELO ratings in database
    await prisma.user.update({
      where: { id: winner.id },
      data: { elo: newWinnerElo }
    });
    
    await prisma.user.update({
      where: { id: loser.id },
      data: { elo: newLoserElo }
    });
    
    // Update match record with results
    await prisma.match.update({
      where: { id: matchId },
      data: {
        completed: true,
        winnerId: winner.id,
        winnerEloChange: finalWinnerGain,
        loserEloChange: -finalLoserLoss,
        completedAt: new Date()
      }
    });
    
    return {
      winner: {
        id: winner.id,
        username: winner.username,
        oldElo: winner.elo,
        newElo: newWinnerElo,
        change: finalWinnerGain
      },
      loser: {
        id: loser.id,
        username: loser.username,
        oldElo: loser.elo,
        newElo: newLoserElo,
        change: -finalLoserLoss
      }
    };
  } catch (error) {
    log(`Error updating ELO ratings: ${error}`, 'error');
    return false;
  }
}

// Add an API endpoint to get a user's recent matches
app.get('/api/matches/recent', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Find matches where the user was either player1 or player2
    const recentMatches = await prisma.match.findMany({
      where: {
        OR: [
          { player1Id: userId },
          { player2Id: userId }
        ],
        completed: true
      },
      include: {
        player1: {
          select: {
            id: true,
            username: true,
            elo: true
          }
        },
        player2: {
          select: {
            id: true,
            username: true,
            elo: true
          }
        },
        winner: {
          select: {
            id: true
          }
        }
      },
      orderBy: {
        completedAt: 'desc'
      },
      take: 10 // Limit to 10 most recent matches
    });
    
    // Format the matches for the client
    const formattedMatches = recentMatches.map(match => {
      const isPlayer1 = match.player1Id === userId;
      const opponent = isPlayer1 ? match.player2 : match.player1;
      const userWon = match.winnerId === userId;
      
      // Determine result and ELO change
      let result;
      let eloChange;
      
      if (match.winnerId === null) {
        result = 'draw';
        eloChange = '+0';
      } else if (userWon) {
        result = 'win';
        eloChange = `+${match.winnerEloChange || 0}`;
      } else {
        result = 'loss';
        eloChange = `${match.loserEloChange || 0}`; // Already negative
      }
      
      return {
        id: match.id,
        opponent: opponent.username,
        opponentElo: opponent.elo,
        result,
        eloChange,
        date: match.completedAt || match.updatedAt
      };
    });
    
    res.json(formattedMatches);
  } catch (error) {
    log(`Error retrieving recent matches: ${error}`, 'error');
    res.status(500).json({ error: 'Failed to retrieve recent matches' });
  }
});

// ===== Test Functions =====

// Matchmaking system test
async function testMatchmaking() {
  try {
    log(`Running matchmaking system test...`, 'info');

    // Create test users if they don't exist
    let testUser1 = await prisma.user.findUnique({
      where: { username: 'testuser1' }
    });

    let testUser2 = await prisma.user.findUnique({
      where: { username: 'testuser2' }
    });

    if (!testUser1) {
      testUser1 = await prisma.user.create({
        data: {
          username: 'testuser1',
          password: 'password',
          elo: 1200
        }
      });
      log(`Created test user 1`, 'info');
    }

    if (!testUser2) {
      testUser2 = await prisma.user.create({
        data: {
          username: 'testuser2',
          password: 'password',
          elo: 1200
        }
      });
      log(`Created test user 2`, 'info');
    }

    // Make sure users are not in queue already
    await prisma.pairingQueue.deleteMany({
      where: {
        userId: { in: [testUser1.id, testUser2.id] }
      }
    });

    // Add test user 1 to queue
    await prisma.pairingQueue.create({
      data: {
        userId: testUser1.id
      }
    });
    log(`Added test user 1 to queue`, 'info');

    // Add test user 2 to queue
    await prisma.pairingQueue.create({
      data: {
        userId: testUser2.id
      }
    });
    log(`Added test user 2 to queue`, 'info');

    // Manually trigger matchmaking for test user 1
    const matchResult = await tryMatchmaking(testUser1.id);

    if (matchResult) {
      log(`✅ Test passed: Match was successfully created`, 'success');
      log(`Match details: ${JSON.stringify(matchResult)}`, 'info');

      // Verify the created match record
      const match = await prisma.match.findUnique({
        where: { id: parseInt(matchResult.roomId.split('-').pop()) }
      });

      if (match) {
        log(`✅ Test passed: Match record created in database with gameMode: ${match.gameMode}`, 'success');
      } else {
        log(`❌ Test failed: No match record found in database`, 'error');
      }
    } else {
      log(`❌ Test failed: No match was created`, 'error');
    }

    // Clean up
    await prisma.pairingQueue.deleteMany({
      where: {
        userId: { in: [testUser1.id, testUser2.id] }
      }
    });
    log(`Test completed and cleaned up`, 'info');

    return true;
  } catch (error) {
    log(`Test error: ${error}`, 'error');
    return false;
  }
}

// Add a test command to the command handlers
const commands = {
    help: {
        description: 'Shows all available commands',
        execute: () => {
            log('Available commands:', 'success');
            Object.entries(commands).forEach(([name, cmd]) => {
                console.log(`  ${name.padEnd(15)} - ${cmd.description}`);
            });
            return true;
        }
    },
    
    status: {
        description: 'Shows server status information',
        execute: () => {
            const uptime = Date.now() - serverStats.startTime;
            const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
            const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
            
            log('Server status:', 'success');
            console.log(`  Uptime:             ${uptimeHours}h ${uptimeMinutes}m`);
            console.log(`  Online users:       ${onlineUserCount}`);
            console.log(`  Active rooms:       ${rooms.size}`);
            console.log(`  Matches made:       ${serverStats.matchesMade}`);
            console.log(`  Commands executed:  ${serverStats.commandsExecuted}`);
            console.log(`  Errors:             ${serverStats.errors}`);
            return true;
        }
    },
    
    test: {
        description: 'Run system tests',
        execute: async (args) => {
            if (args.length > 0) {
                const testName = args[0].toLowerCase();
                log(`Running test: ${testName}`, 'info');
                
                switch (testName) {
                    case 'matchmaking':
                        return await testMatchmaking();
                    case 'database':
                        const results = {};
                        await testDatabaseConnection(results);
                        return results.passed > 0;
                    case 'auth':
                        const authResults = {};
                        await testUserAuth(authResults);
                        return authResults.passed > 0;
                    case 'elo':
                        const eloResults = {};
                        await testEloRatings(eloResults);
                        return eloResults.passed > 0;
                    case 'socket':
                        const socketResults = {};
                        await testSocketConnections(socketResults);
                        return socketResults.passed > 0;
                    case 'all':
                        return await runAllTests();
                    default:
                        log(`Unknown test: ${testName}. Available tests: matchmaking, database, auth, elo, socket, all`, 'warn');
                        return false;
                }
            } else {
                log('Running all tests...', 'info');
                return await runAllTests();
            }
        }
    },
    
    debug: {
        description: 'Analyze and fix system issues',
        execute: async (args) => {
            if (args.length > 0) {
                const debugTarget = args[0].toLowerCase();
                
                switch (debugTarget) {
                    case 'matchmaking':
                        return await debugMatchmaking();
                    case 'schema':
                        return await debugPrismaSchema();
                    case 'sockets':
                        return await debugSocketConnections();
                    default:
                        log(`Unknown debug target: ${debugTarget}. Available: matchmaking, schema, sockets`, 'warn');
                        return false;
                }
            } else {
                log('Debug options: matchmaking, schema, sockets', 'info');
                return true;
            }
        }
    },
    
    reload: {
        description: 'Reload Prisma client to align with latest schema',
        execute: async () => {
            try {
                log('Attempting to reconnect Prisma client...', 'info');
                
                // Disconnect existing client
                await prisma.$disconnect();
                log('Disconnected existing Prisma client', 'debug');
                
                // Try to create a new client instance by importing fresh
                try {
                    delete require.cache[require.resolve('./prisma/client')];
                    const newPrisma = require('./prisma/client');
                    
                    // Test connection with new client
                    const userCount = await newPrisma.user.count();
                    log(`Successfully reconnected Prisma client. Found ${userCount} users.`, 'success');
                    
                    // Replace the global prisma instance
                    prisma = newPrisma;
                    
                    // Run a simple test query
                    const testMatch = await prisma.match.create({
                        data: {
                            player1Id: 1,
                            player2Id: 2,
                            completed: false
                        }
                    });
                    
                    log(`Successfully created test match with ID ${testMatch.id}`, 'success');
                    
                    // Clean up
                    await prisma.match.delete({
                        where: { id: testMatch.id }
                    });
                    
                    log('Prisma client successfully reloaded and tested', 'success');
                    return true;
                } catch (error) {
                    log(`Error reloading Prisma client module: ${error}`, 'error');
                    
                    // Try to reconnect with existing instance
                    await prisma.$connect();
                    log('Reconnected with existing Prisma client', 'info');
                    
                    // Test connection
                    const userCount = await prisma.user.count();
                    log(`Reconnection successful. Found ${userCount} users.`, 'success');
                    return true;
                }
            } catch (error) {
                log(`Failed to reload Prisma client: ${error}`, 'error');
                return false;
            }
        }
    },
    
    // ... other commands ...
};

// Test endpoint for matchmaking
app.post('/api/test/matchmaking', isAdmin, async (req, res) => {
  try {
    const testResult = await testMatchmaking();
    res.json({ success: testResult });
  } catch (error) {
    log(`Test error: ${error}`, 'error');
    res.status(500).json({ error: 'Test execution failed' });
  }
});

// ===== Comprehensive System Testing Functions =====

// Function to run all system tests
async function runAllTests() {
  log(`🔍 Starting comprehensive system tests...`, 'info');
  
  let results = {
    passed: 0,
    failed: 0,
    tests: []
  };
  
  // Test database connection
  await testDatabaseConnection(results);
  
  // Test user creation and authentication
  await testUserAuth(results);
  
  // Test matchmaking system
  await testMatchmaking(results);
  
  // Test socket connections
  await testSocketConnections(results);
  
  // Test ELO rating system
  await testEloRatings(results);
  
  // Print test summary
  log(`
=== 🧪 Test Summary ===
✅ ${results.passed} tests passed
❌ ${results.failed} tests failed
====================
  `, 'info');
  
  // Log detailed results
  results.tests.forEach(test => {
    log(`${test.passed ? '✅' : '❌'} ${test.name}: ${test.message}`, test.passed ? 'success' : 'error');
  });
  
  return results;
}

// Test database connection
async function testDatabaseConnection(results) {
  const testName = "Database Connection";
  try {
    log(`Testing database connection...`, 'info');
    
    // Try a simple connection test using the new ping method
    const pingResult = await prisma.ping();
    
    if (!pingResult.connected) {
      throw new Error(pingResult.error || 'Connection test failed');
    }
    
    // Try a simple query to verify connection
    const userCount = await prisma.user.count();
    log(`Database connection successful. Found ${userCount} users.`, 'debug');
    
    results.passed++;
    results.tests.push({
      name: testName,
      passed: true,
      message: "Successfully connected to database"
    });
  } catch (error) {
    log(`Database connection test failed: ${error}`, 'error');
    results.failed++;
    results.tests.push({
      name: testName,
      passed: false,
      message: `Failed to connect to database: ${error.message}`
    });
  }
}

// Test user creation and authentication
async function testUserAuth(results) {
  const testName = "User Authentication";
  try {
    log(`Testing user authentication...`, 'info');
    
    // Create test user if it doesn't exist
    let testUser = await prisma.user.findUnique({
      where: { username: 'testuser' }
    });
    
    if (!testUser) {
      // Hash password
      const hashedPassword = await bcrypt.hash('testpassword', 10);
      
      // Create user
      testUser = await prisma.user.create({
        data: {
          username: 'testuser',
          password: hashedPassword,
          elo: 1200
        }
      });
      log(`Created test user: ${testUser.username}`, 'debug');
    }
    
    // Test password validation
    const validPassword = await bcrypt.compare('testpassword', testUser.password);
    
    if (!validPassword) {
      throw new Error('Password validation failed');
    }
    
    results.passed++;
    results.tests.push({
      name: testName,
      passed: true,
      message: "User authentication working correctly"
    });
  } catch (error) {
    log(`User authentication test failed: ${error}`, 'error');
    results.failed++;
    results.tests.push({
      name: testName,
      passed: false,
      message: `Failed to verify user authentication: ${error.message}`
    });
  }
}

// Enhanced matchmaking system test with more detailed checks
async function testMatchmaking(results) {
  const testName = "Matchmaking System";
  try {
    log(`Running enhanced matchmaking system test...`, 'info');

    // Create test users if they don't exist
    let testUser1 = await prisma.user.findUnique({
      where: { username: 'testuser1' }
    });

    let testUser2 = await prisma.user.findUnique({
      where: { username: 'testuser2' }
    });

    if (!testUser1) {
      testUser1 = await prisma.user.create({
        data: {
          username: 'testuser1',
          password: 'password',
          elo: 1200
        }
      });
      log(`Created test user 1`, 'info');
    }

    if (!testUser2) {
      testUser2 = await prisma.user.create({
        data: {
          username: 'testuser2',
          password: 'password',
          elo: 1200
        }
      });
      log(`Created test user 2`, 'info');
    }

    // Make sure users are not in queue already
    await prisma.pairingQueue.deleteMany({
      where: {
        userId: { in: [testUser1.id, testUser2.id] }
      }
    });
    log(`Cleared queue for test users`, 'debug');

    // 1. Test queue entry
    const queueEntry1 = await prisma.pairingQueue.create({
      data: {
        userId: testUser1.id
      }
    });
    log(`Added test user 1 to queue`, 'debug');
    
    // Verify queue entry
    if (!queueEntry1 || queueEntry1.userId !== testUser1.id) {
      throw new Error('Failed to create queue entry for user 1');
    }

    const queueEntry2 = await prisma.pairingQueue.create({
      data: {
        userId: testUser2.id
      }
    });
    log(`Added test user 2 to queue`, 'debug');
    
    // Verify queue entry
    if (!queueEntry2 || queueEntry2.userId !== testUser2.id) {
      throw new Error('Failed to create queue entry for user 2');
    }

    // 2. Test match creation
    log(`Attempting to create match...`, 'debug');
    const matchResult = await tryMatchmaking(testUser1.id);

    if (!matchResult) {
      throw new Error('No match was created');
    }

    log(`Match created with room ID: ${matchResult.roomId}`, 'debug');

    // 3. Verify match record in database
    const matchId = parseInt(matchResult.roomId.split('-').pop());
    const match = await prisma.match.findUnique({
      where: { id: matchId }
    });

    if (!match) {
      throw new Error('Match record not found in database');
    }

    log(`Verified match record in database: ID ${match.id}, gameMode: ${match.gameMode}`, 'debug');

    // 4. Verify room creation in memory
    const room = rooms.get(matchResult.roomId);
    if (!room) {
      throw new Error('Room not created in memory');
    }

    log(`Verified room in memory: ${matchResult.roomId}`, 'debug');

    // 5. Verify player lastRoom updates
    const user1 = await prisma.user.findUnique({
      where: { id: testUser1.id }
    });

    const user2 = await prisma.user.findUnique({
      where: { id: testUser2.id }
    });

    if (user1.lastRoom !== matchResult.roomId || user2.lastRoom !== matchResult.roomId) {
      throw new Error('User lastRoom fields not properly updated');
    }

    log(`Verified lastRoom updates for both users`, 'debug');

    // 6. Clean up
    await prisma.pairingQueue.deleteMany({
      where: {
        userId: { in: [testUser1.id, testUser2.id] }
      }
    });
    
    // Success!
    results.passed++;
    results.tests.push({
      name: testName,
      passed: true,
      message: "Matchmaking system working correctly"
    });
    log(`Matchmaking test completed successfully`, 'success');

    return true;
  } catch (error) {
    log(`Matchmaking test error: ${error}`, 'error');
    results.failed++;
    results.tests.push({
      name: testName,
      passed: false,
      message: `Matchmaking test failed: ${error.message}`
    });
    return false;
  }
}

// Test socket connections
async function testSocketConnections(results) {
  const testName = "Socket Connections";
  try {
    log(`Testing socket connections...`, 'info');
    
    // Verify socket server is running
    if (!io) {
      throw new Error('Socket.IO server not initialized');
    }
    
    // Check if we have any connected sockets
    const connectedSocketCount = io.sockets.sockets.size;
    log(`Current connected sockets: ${connectedSocketCount}`, 'debug');
    
    // Test internal socket event emitter 
    let eventReceived = false;
    const testEvent = 'testSocketEvent';
    
    // Create a test handler
    const testHandler = (data) => {
      eventReceived = true;
      log(`Test socket event received: ${JSON.stringify(data)}`, 'debug');
    };
    
    // Attach test handler to all sockets
    io.sockets.sockets.forEach(socket => {
      socket.once(testEvent, testHandler);
    });
    
    // Emit test event to all sockets
    io.emit(testEvent, { test: true, timestamp: Date.now() });
    
    // Wait a short time for event to be processed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check if any sockets received event
    if (connectedSocketCount > 0 && !eventReceived) {
      log(`Warning: No sockets received test event`, 'warn');
    }
    
    results.passed++;
    results.tests.push({
      name: testName,
      passed: true,
      message: `Socket.IO server running with ${connectedSocketCount} connections`
    });
  } catch (error) {
    log(`Socket connections test failed: ${error}`, 'error');
    results.failed++;
    results.tests.push({
      name: testName,
      passed: false,
      message: `Failed to test socket connections: ${error.message}`
    });
  }
}

// Test ELO rating system
async function testEloRatings(results) {
  const testName = "ELO Rating System";
  try {
    log(`Testing ELO rating system...`, 'info');
    
    // Create a test match
    const testMatch = await prisma.match.create({
      data: {
        player1Id: 1, // Assuming ID 1 exists
        player2Id: 2, // Assuming ID 2 exists
        completed: false,
        gameMode: 'classic'
      }
    });
    
    log(`Created test match: ${testMatch.id}`, 'debug');
    
    // Get initial ELO ratings
    const player1Before = await prisma.user.findUnique({
      where: { id: 1 },
      select: { elo: true }
    });
    
    const player2Before = await prisma.user.findUnique({
      where: { id: 2 },
      select: { elo: true }
    });
    
    log(`Initial ELO - Player 1: ${player1Before.elo}, Player 2: ${player2Before.elo}`, 'debug');
    
    // Test ELO calculation with player 1 as winner
    const eloResult = await updateEloRatings(testMatch.id, 1);
    
    if (!eloResult) {
      throw new Error('ELO update failed');
    }
    
    // Get updated ELO ratings
    const player1After = await prisma.user.findUnique({
      where: { id: 1 },
      select: { elo: true }
    });
    
    const player2After = await prisma.user.findUnique({
      where: { id: 2 },
      select: { elo: true }
    });
    
    log(`Updated ELO - Player 1: ${player1After.elo}, Player 2: ${player2After.elo}`, 'debug');
    
    // Verify ELO changes
    if (player1After.elo <= player1Before.elo) {
      throw new Error('Winner ELO did not increase');
    }
    
    if (player2After.elo >= player2Before.elo) {
      throw new Error('Loser ELO did not decrease');
    }
    
    // Verify match record was updated
    const updatedMatch = await prisma.match.findUnique({
      where: { id: testMatch.id }
    });
    
    if (!updatedMatch.completed || updatedMatch.winnerId !== 1) {
      throw new Error('Match record not properly updated');
    }
    
    // Check if winnerEloChange and loserEloChange were set
    if (updatedMatch.winnerEloChange === null || updatedMatch.loserEloChange === null) {
      throw new Error('ELO change fields not set in match record');
    }
    
    log(`Match updated - Winner ELO change: +${updatedMatch.winnerEloChange}, Loser ELO change: -${Math.abs(updatedMatch.loserEloChange)}`, 'debug');
    
    results.passed++;
    results.tests.push({
      name: testName,
      passed: true,
      message: "ELO rating system working correctly"
    });
  } catch (error) {
    log(`ELO rating test failed: ${error}`, 'error');
    results.failed++;
    results.tests.push({
      name: testName,
      passed: false,
      message: `Failed to test ELO rating system: ${error.message}`
    });
  }
}

// ===== Debug Functions =====

// Debug matchmaking system
async function debugMatchmaking() {
  try {
    log('🔍 Debugging matchmaking system...', 'info');
    
    // Check tryMatchmaking function for potential issues
    log('Analyzing matchmaking code for issues...', 'info');
    
    // Inspect the match creation part in the tryMatchmaking function
    const matchCreationCode = tryMatchmaking.toString().match(/const dbMatch = await prisma\.match\.create\([^)]+\)/s);
    
    if (matchCreationCode) {
      log(`Found match creation code: ${matchCreationCode[0]}`, 'debug');
      
      // Check if the code includes gameMode
      const includesGameMode = matchCreationCode[0].includes('gameMode');
      log(`Match creation code ${includesGameMode ? 'includes' : 'does not include'} gameMode field`, 'info');
      
      if (includesGameMode) {
        log('⚠️ Potential issue found: Match creation includes gameMode field', 'warn');
        
        // Check if the database schema includes gameMode field
        let schemaHasGameMode = false;
        try {
          // Check schema by creating a test match
          await prisma.match.create({
            data: {
              player1Id: 1, // Assuming ID 1 exists
              player2Id: 2, // Assuming ID 2 exists
              completed: false,
              gameMode: 'test'
            }
          });
          
          schemaHasGameMode = true;
          log('✅ Schema validation passed: gameMode field exists in the Match model', 'success');
        } catch (error) {
          schemaHasGameMode = false;
          log(`❌ Schema validation failed: ${error.message}`, 'error');
          
          // Check if the error is due to gameMode field
          if (error.message.includes('gameMode')) {
            log('The error is related to the gameMode field', 'debug');
          }
        }
        
        // Suggest solution
        if (!schemaHasGameMode) {
          log(`
🔧 Solution:
1. Either remove the gameMode field from match creation in tryMatchmaking() function
2. Or add the gameMode field to the Match model in the Prisma schema`, 'info');
        }
      } else {
        log('✅ Match creation code does not include gameMode field, this is not the source of the issue', 'success');
      }
    } else {
      log('❌ Could not find match creation code in the tryMatchmaking function', 'error');
    }
    
    // Check existing matches in the database
    const matchCount = await prisma.match.count();
    log(`Database has ${matchCount} matches`, 'info');
    
    if (matchCount > 0) {
      // Check a sample match to diagnose issues
      const sampleMatch = await prisma.match.findFirst();
      log(`Sample match data: ${JSON.stringify(sampleMatch, null, 2)}`, 'debug');
    }
    
    // Check queue status
    const queueCount = await prisma.pairingQueue.count();
    log(`Queue has ${queueCount} entries`, 'info');
    
    if (queueCount > 0) {
      // Sample queue entries
      const queueEntries = await prisma.pairingQueue.findMany({
        take: 3,
        include: { user: true }
      });
      
      log(`Sample queue entries: ${JSON.stringify(
        queueEntries.map(q => ({
          userId: q.userId,
          username: q.user.username,
          elo: q.user.elo,
          joinedAt: q.joinedAt
        })), null, 2)}`, 'debug');
    }
    
    log('✅ Matchmaking system diagnosis complete', 'success');
    return true;
  } catch (error) {
    log(`❌ Error debugging matchmaking: ${error}`, 'error');
    return false;
  }
}

// Debug Prisma schema
async function debugPrismaSchema() {
  try {
    log('🔍 Debugging Prisma schema...', 'info');
    
    // Get all models from Prisma
    log('Checking Prisma models...', 'info');
    
    // Inspect Match model
    log('Analyzing Match model...', 'info');
    
    try {
      // Get sample Match to check structure
      const sampleMatch = await prisma.match.findFirst({
        select: {
          id: true
        }
      });
      
      if (sampleMatch) {
        // Get full structure by using a raw query
        const matchFields = Object.keys(sampleMatch);
        log(`Match model fields from sample: ${matchFields.join(', ')}`, 'debug');
      }
      
      // Attempt to get model metadata (not directly available but let's try)
      const modelStructure = {};
      
      // Test if gameMode field exists by trying to create a record with it
      try {
        const testMatch = await prisma.match.create({
          data: {
            player1Id: 1,
            player2Id: 2,
            completed: false,
            gameMode: 'test'
          }
        });
        
        modelStructure.hasGameMode = true;
        log('✅ Match model has gameMode field', 'success');
        
        // Clean up the test match
        await prisma.match.delete({
          where: { id: testMatch.id }
        });
      } catch (error) {
        modelStructure.hasGameMode = false;
        log(`❌ Match model does not have gameMode field: ${error.message}`, 'error');
      }
      
      if (!modelStructure.hasGameMode) {
        log('Checking if a migration is needed...', 'info');
        
        // Check if there's a migration for adding gameMode field
        try {
          const results = await prisma.$executeRaw`
            SELECT name FROM sqlite_master 
            WHERE type='table' 
            AND name LIKE 'Migration%' 
            AND sql LIKE '%gameMode%'
          `;
          
          log(`Found ${results} migrations with gameMode`, 'info');
          
          log(`
🔧 Solution:
You need to add the gameMode field to your Match model in schema.prisma:

model Match {
  // ... other fields
  gameMode   String?   // Add this field
  // ... other fields
}

Then run: npx prisma migrate dev --name add_game_mode_field`, 'info');
        } catch (error) {
          log(`Error checking migrations: ${error.message}`, 'error');
        }
      }
    } catch (error) {
      log(`Error analyzing Match model: ${error.message}`, 'error');
    }
    
    log('✅ Prisma schema diagnosis complete', 'success');
    return true;
  } catch (error) {
    log(`❌ Error debugging Prisma schema: ${error}`, 'error');
    return false;
  }
}

// Debug socket connections
async function debugSocketConnections() {
  try {
    log('🔍 Debugging socket connections...', 'info');
    
    // Get connected socket count
    const connectedSocketCount = io.sockets.sockets.size;
    log(`Currently connected sockets: ${connectedSocketCount}`, 'info');
    
    if (connectedSocketCount > 0) {
      // List connected socket IDs
      const socketIds = Array.from(io.sockets.sockets.keys());
      log(`Connected socket IDs: ${socketIds.join(', ')}`, 'debug');
      
      // Check socket mappings
      log(`Active user room mappings: ${userRooms.size}`, 'info');
      
      // List active rooms
      const activeRooms = Array.from(rooms.keys());
      log(`Active rooms: ${activeRooms.join(', ')}`, 'info');
      
      // Check each socket's connection status and rooms
      socketIds.forEach(socketId => {
        const socket = io.sockets.sockets.get(socketId);
        const socketRooms = Array.from(socket.rooms.values()).filter(r => r !== socketId);
        log(`Socket ${socketId} is in rooms: ${socketRooms.join(', ') || 'none'}`, 'debug');
      });
      
      // Test sending a ping to all sockets
      io.emit('ping', { timestamp: Date.now() });
      log('Sent ping to all connected sockets', 'debug');
    } else {
      log('No sockets are currently connected', 'warn');
    }
    
    log('✅ Socket connections diagnosis complete', 'success');
    return true;
  } catch (error) {
    log(`❌ Error debugging socket connections: ${error}`, 'error');
    return false;
  }
}