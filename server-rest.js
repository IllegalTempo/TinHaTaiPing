    rooms: {
        description: 'Lists active game rooms or toggles room event logging',
        execute: (args) => {
            if (args.length > 0 && (args[0] === 'on' || args[0] === 'off' || args[0] === 'toggle')) {
                if (args[0] === 'on') {
                    logCategories.ROOM_EVENTS = true;
                } else if (args[0] === 'off') {
                    logCategories.ROOM_EVENTS = false;
                } else {
                    logCategories.ROOM_EVENTS = !logCategories.ROOM_EVENTS;
                }
                log(`Room event logging ${logCategories.ROOM_EVENTS ? 'enabled' : 'disabled'}`, 'success');
                return true;
            }
            
            // Default behavior - list rooms
            log(`Active rooms (${rooms.size}):`, 'success');
            let count = 0;
            rooms.forEach((room, roomId) => {
                console.log(`  ${roomId}: ${room.players.length} players, Mode: ${room.gameMode || 'classic'}, Started: ${room.Started ? 'Yes' : 'No'}`);
                count++;
                
                // Limit output to first 20 rooms
                if (count === 20 && rooms.size > 20) {
                    console.log(`  ... and ${rooms.size - 20} more`);
                    return;
                }
            });
            return true;
        }
    },
    
    queue: {
        description: 'Shows users in matchmaking queue',
        execute: async () => {
            const queuedUsers = await prisma.pairingQueue.findMany({
                include: { user: { select: { username: true, elo: true } } }
            });
            
            log(`Users in matchmaking queue (${queuedUsers.length}):`, 'success');
            queuedUsers.forEach(entry => {
                console.log(`  ${entry.user.username} (ELO: ${entry.user.elo}), Range: ${entry.eloMin || 'any'}-${entry.eloMax || 'any'}`);
            });
            return true;
        }
    },
    
    clear: {
        description: 'Clears the console',
        execute: () => {
            console.clear();
            return true;
        }
    },
    
    debug: {
        description: 'Toggles debug mode',
        execute: (args) => {
            if (args[0] === 'on') {
                DEBUG_MODE = true;
                log('Debug mode enabled', 'success');
            } else if (args[0] === 'off') {
                DEBUG_MODE = false;
                log('Debug mode disabled', 'success');
            } else {
                DEBUG_MODE = !DEBUG_MODE;
                log(`Debug mode ${DEBUG_MODE ? 'enabled' : 'disabled'}`, 'success');
            }
            return true;
        }
    },
    
    verbose: {
        description: 'Toggles verbose logging',
        execute: (args) => {
            if (args[0] === 'on') {
                VERBOSE_LOGGING = true;
                log('Verbose logging enabled', 'success');
            } else if (args[0] === 'off') {
                VERBOSE_LOGGING = false;
                log('Verbose logging disabled', 'success');
            } else {
                VERBOSE_LOGGING = !VERBOSE_LOGGING;
                log(`Verbose logging ${VERBOSE_LOGGING ? 'enabled' : 'disabled'}`, 'success');
            }
            return true;
        }
    },
    
    match: {
        description: 'Forces matchmaking check for all users in queue',
        execute: async () => {
            const queuedUsers = await prisma.pairingQueue.findMany({
                select: { userId: true }
            });
            
            log(`Processing matchmaking for ${queuedUsers.length} users in queue`, 'info');
            
            let matchCount = 0;
            for (const user of queuedUsers) {
                const matchResult = await tryMatchmaking(user.userId);
                
                if (matchResult) {
                    matchCount++;
                    serverStats.matchesMade++;
                    log(`Match found for user ${user.userId}, creating room ${matchResult.roomId}`, 'success');
                    
                    // Create a room for the match
                    const roomId = matchResult.roomId;
                    
                    // Fetch usernames for both players
                    const player1 = await prisma.user.findUnique({
                        where: { id: matchResult.player1.id },
                        select: { username: true }
                    });
                    
                    const player2 = await prisma.user.findUnique({
                        where: { id: matchResult.player2.id },
                        select: { username: true }
                    });
                    
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
                                username: player1.username || `Player1`,
                                isHost: true,
                                userId: matchResult.player1.id
                            },
                            {
                                socketId: null, // Will be set when they join the room
                                username: player2.username || `Player2`,
                                isHost: false,
                                userId: matchResult.player2.id
                            }
                        ]
                    };
                    
                    // Store the room
                    rooms.set(roomId, room);
                    
                    log(`Created room ${roomId} for matched players: ${player1.username} vs ${player2.username}`, 'success');
                }
            }
            
            log(`Matchmaking complete. Created ${matchCount} matches.`, 'success');
            return true;
        }
    },
    
    stop: {
        description: 'Stops the server',
        execute: () => {
            log('Stopping server...', 'info');
            // Clean up resources and exit
            if (global.matchmakingInterval) {
                clearInterval(global.matchmakingInterval);
            }
            log('Server stopped.', 'success');
            process.exit(0);
            return true;
        }
    },
    
    // Add new logging category commands
    logs: {
        description: 'Shows current log category status or toggles specific log categories',
        execute: (args) => {
            if (!args.length) {
                // Show current status of all log categories
                log('Current logging categories status:', 'success');
                Object.entries(logCategories).forEach(([category, enabled]) => {
                    console.log(`  ${category.padEnd(15)} - ${enabled ? 'ENABLED' : 'DISABLED'}`);
                });
                return true;
            }
            
            const category = args[0].toUpperCase();
            const action = args[1]?.toLowerCase();
            
            if (!logCategories.hasOwnProperty(category)) {
                log(`Unknown log category: ${category}. Use 'logs' command without arguments to see available categories.`, 'error');
                return false;
            }
            
            if (category === 'ERRORS') {
                log('ERROR logs cannot be disabled for safety reasons.', 'warn');
                return false;
            }
            
            if (action === 'on') {
                logCategories[category] = true;
                log(`Logging category ${category} enabled`, 'success');
            } else if (action === 'off') {
                logCategories[category] = false;
                log(`Logging category ${category} disabled`, 'success');
            } else {
                // Toggle if no specific action
                logCategories[category] = !logCategories[category];
                log(`Logging category ${category} ${logCategories[category] ? 'enabled' : 'disabled'}`, 'success');
            }
            return true;
        }
    },
    
    // Add quick toggles for common log categories
    connections: {
        description: 'Toggles user connection/disconnection logs',
        execute: () => {
            logCategories.CONNECTIONS = !logCategories.CONNECTIONS;
            log(`Connection logging ${logCategories.CONNECTIONS ? 'enabled' : 'disabled'}`, 'success');
            return true;
        }
    },
    
    matchmaking: {
        description: 'Toggles matchmaking logging',
        execute: () => {
            logCategories.MATCHMAKING = !logCategories.MATCHMAKING;
            log(`Matchmaking logging ${logCategories.MATCHMAKING ? 'enabled' : 'disabled'}`, 'success');
            return true;
        }
    },
    
    gameplay: {
        description: 'Toggles game events logging',
        execute: () => {
            logCategories.GAME_EVENTS = !logCategories.GAME_EVENTS;
            log(`Game events logging ${logCategories.GAME_EVENTS ? 'enabled' : 'disabled'}`, 'success');
            return true;
        }
    },
};

// Handle commands from the console
rl.on('line', async (line) => {
    const args = line.trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();
    
    // Execute the command if it exists
    if (commands[cmd]) {
        const result = await commands[cmd].execute(args);
        if (result) {
            serverStats.commandsExecuted++;
        }
    } else if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') {
        commands.stop.execute();
    } else if (cmd) {
        log(`Unknown command: ${cmd}. Type 'help' for available commands.`, 'error');
    }
    
    rl.prompt();
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
