import i18n from '../i18n.js';
import { createLanguageSelector } from '../language-selector.js';

// Game state
let gameState = {
    gold: 500,
    units: [],
    isLeftPlayer: false
};

// Unit costs
const UNIT_COSTS = {
    miner: 100,
    soldier: 200,
    barrier: 50
};

// Mineral value
const MINERAL_VALUE = 75;

document.addEventListener('DOMContentLoaded', async function() {
    // Get room ID and username from URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('roomId');
    const usernameFromUrl = urlParams.get('username');
    
    if (!roomId) {
        window.location.href = '/';
        throw new Error('No room ID provided');
    }

    // Store room ID globally for reconnection
    window.roomId = roomId;
    
    let currentUser = null;
    
    // Initialize language system
    i18n.init();
    
    // Create language selector
    createLanguageSelector('language-selector');
    
    // Check authentication first
    async function checkAuth() {
        try {
            const response = await fetch('/api/user/me');
            if (response.status === 401) {
                window.location.href = '/login.html';
                return false;
            }
            currentUser = await response.json();
            
            // Update auth links immediately after successful authentication
            const authLinks = document.getElementById('auth-links');
            authLinks.innerHTML = `
                <a href="/dashboard.html" id="welcome-user" data-i18n="user_profile"></a>
                <a href="#" id="logout-link" data-i18n="logout"></a>
            `;
            
            // Update welcome text
            document.getElementById('welcome-user').textContent = `${i18n.translate('welcome')}, ${currentUser.username}`;
            
            // Apply translations to newly created elements
            i18n.applyTranslations();
            
            // Add logout functionality
            document.getElementById('logout-link').addEventListener('click', async (e) => {
                e.preventDefault();
                
                try {
                    await fetch('/api/logout', {
                        method: 'POST'
                    });
                    window.location.href = '/';
                } catch (error) {
                    console.error('Logout failed', error);
                }
            });
            
            return true;
        } catch (error) {
            console.error('Error checking auth status:', error);
            window.location.href = '/login.html';
            return false;
        }
    }
    
    // Check authentication and proceed if authenticated
    if (await checkAuth()) {
        // Initialize Socket.IO
        const socket = io();
        
        // Set room ID display
        document.getElementById('room-id').textContent = roomId;
        
        // Set up copy room link button
        document.getElementById('copy-room-link').addEventListener('click', () => {
            const url = `${window.location.origin}/game-room.html?roomId=${roomId}`;
            navigator.clipboard.writeText(url).then(() => {
                alert(i18n.translate('link_copied'));
            }).catch(err => {
                console.error('Failed to copy link:', err);
            });
        });
        
        // Set up start game button
        document.getElementById('start-game-btn').addEventListener('click', () => {
            socket.emit('startGame');
        });
        
        // Set up leave room button
        document.getElementById('leave-room-btn').addEventListener('click', () => {
            socket.emit('leaveRoom');
            window.location.href = '/';
        });

        // First, check if the room exists
        socket.on('connect', () => {
            console.log('Connected to socket server, checking room:', roomId);
            
            // Check if this room exists
            socket.emit('checkRoom', { roomId: roomId });
        });
        
        // Handle reconnection events
        socket.on('reconnect', () => {
            console.log('Socket reconnected, attempting to rejoin room:', window.roomId);
            if (window.roomId && currentUser) {
                // Automatically attempt to rejoin the room
                socket.emit('joinRoom', {
                    roomId: window.roomId,
                    username: currentUser.username
                });
            }
        });
        
        // Handle room check response
        socket.on('roomCheckResult', (data) => {
            console.log('Room check result:', data);
            
            if (data.exists) {
                console.log('Room exists, joining:', roomId);
                // Room exists, join it
                socket.emit('joinRoom', {
                    roomId: roomId,
                    username: currentUser.username
                });
            } else {
                console.log('Room does not exist, creating new room:', roomId);
                // Room doesn't exist, create it
                socket.emit('createRoom', {
                    roomId: roomId,
                    username: currentUser.username
                });
            }
        });
        
        // Add specific handler for successful room join
        socket.on('roomJoined', (data) => {
            console.log('Successfully joined room:', data);
            
            // Update UI with game mode if provided
            if (data.gameMode && window.gameModeFunctions) {
                window.gameModeFunctions.updateGameModeBanner(data.gameMode);
            }
            
            // Update room display just in case
            document.getElementById('room-id').textContent = data.roomId;
        });
        
        // Handle errors from the server
        socket.on('error', (data) => {
            console.error('Socket error:', data);
            
            // Handle specific error messages
            if (data.message === 'room_not_found') {
                alert('Room not found. You will be redirected to the home page.');
                
                // Clear the lastRoom reference via API
                fetch('/api/user/clear-last-room', { method: 'POST' })
                    .catch(err => console.error('Failed to clear last room:', err));
                
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000);
            } else if (data.message === 'room_full' || data.message === 'game_already_started') {
                alert(`Cannot join: ${data.message}. Returning to home page.`);
                window.location.href = '/';
            } else {
                // Generic error handling
                alert(`Error: ${data.message}`);
            }
        });
        
        // Handle player list updates
        socket.on('playerList', (data) => {
            console.log('Received player list:', data);
            const playersList = document.getElementById('players');
            const playerCount = document.getElementById('player-count');
            const startButton = document.getElementById('start-game-btn');
            
            // Update player count
            playerCount.textContent = data.players.length;
            
            // Update player list
            playersList.innerHTML = data.players.map(player => 
                `<li>${player.username} ${player.isHost ? `(${i18n.translate('room_owner')})` : ''}</li>`
            ).join('');

            // Find current user in the player list
            const currentPlayer = data.players.find(p => p.username === currentUser.username);
            
            // Show start button only if:
            // 1. Current user is the host
            // 2. There are exactly 2 players
            if (currentPlayer?.isHost && data.players.length === 2) {
                startButton.style.display = 'block';
            } else {
                startButton.style.display = 'none';
            }
        });
        
        // Handle gold updates
        socket.on('goldUpdate', (data) => {
            if (data.playerId === socket.id) {
                gameState.gold = data.gold;
                updateGoldDisplay();
            }
        });
        
        // Handle synchronized gold updates
        socket.on('goldSyncUpdate', (data) => {
            // Update both players' gold displays
            data.players.forEach(playerData => {
                if (playerData.playerId === socket.id) {
                    // This is our gold
                    gameState.gold = playerData.gold;
                }
                
                // Update the display for this player
                const isCurrentPlayer = playerData.playerId === socket.id;
                const playerSide = (isCurrentPlayer === gameState.isLeftPlayer) ? 'left' : 'right';
                
                const goldElement = document.querySelector(`.player-info.${playerSide} .gold-amount`);
                if (goldElement) {
                    goldElement.textContent = playerData.gold;
                }
            });
        });
        
        // Handle unit spawned
        socket.on('unitSpawned', (data) => {
            // Add the unit to the game
            spawnUnit(data);
        });
        
        // Handle game start
        socket.on('gameStarted', (initialState) => {
            document.querySelector('.room-info').style.display = 'none';
            document.querySelector('.player-list').style.display = 'none';
            document.querySelector('.room-actions').style.display = 'none';
            document.getElementById('game-container').style.display = 'block';
            // Save players to gameState for later reference
            gameState.players = initialState.players;
            // Find which player we are (left or right)
            const players = initialState.players;
            gameState.isLeftPlayer = players[0].id === socket.id || players[0].socketId === socket.id;
            // Find our player object and get initial gold
            const ourPlayer = players.find(p => p.id === socket.id || p.socketId === socket.id);
            if (ourPlayer) {
                gameState.gold = ourPlayer.gold;
            }
            // Initialize game state
            setupGame();
            // Update both players' gold displays
            const leftPlayer = players[0];
            const rightPlayer = players[1];
            const leftGoldElement = document.querySelector('.player-info.left .gold-amount');
            const rightGoldElement = document.querySelector('.player-info.right .gold-amount');
            if (leftGoldElement && leftPlayer) {
                leftGoldElement.textContent = leftPlayer.gold;
            }
            if (rightGoldElement && rightPlayer) {
                rightGoldElement.textContent = rightPlayer.gold;
            }
            resetRPSUI();
            startRPSTimer();
        });

        // Handle player left
        socket.on('playerLeft', (data) => {
            if (data.isHost) {
                alert(i18n.translate('host_left'));
                // Redirect to homepage when host leaves
                window.location.href = '/';
            } else {
                alert(i18n.translate('player_left'));
            }
        });
        
        // Functions for game setup and display
        function setupGame() {
            // Set player names for left and right panels
            const playerInfoElements = document.querySelectorAll('.player-info');
            // Use gameState.players for correct order
            let leftPlayer = null, rightPlayer = null;
            if (gameState.players && gameState.players.length === 2) {
                leftPlayer = gameState.players[0];
                rightPlayer = gameState.players[1];
            }
            // Set left panel name
            if (playerInfoElements[0]) {
                playerInfoElements[0].querySelector('.player-name').textContent = leftPlayer ? leftPlayer.username : '';
            }
            // Set right panel name
            const rightNameSpan = document.getElementById('opponent-name') || (playerInfoElements[1] && playerInfoElements[1].querySelector('.player-name'));
            if (rightNameSpan) {
                rightNameSpan.textContent = rightPlayer ? rightPlayer.username : '';
            }
            // Initialize gold display
            updateGoldDisplay();
            // Setup unit selection
            setupUnitSelection();
        }
        
        function updateGoldDisplay() {
            // This function is now only used for initial display setup
            // Real-time updates come through goldSyncUpdate event
            const leftGoldElement = document.querySelector('.player-info.left .gold-amount');
            const rightGoldElement = document.querySelector('.player-info.right .gold-amount');
            
            if (gameState.isLeftPlayer) {
                // We are the left player
                leftGoldElement.textContent = gameState.gold;
            } else {
                // We are the right player
                rightGoldElement.textContent = gameState.gold;
            }
        }
        
        function setupUnitSelection() {
            const unitOptions = document.querySelectorAll('.unit-option');
            unitOptions.forEach(option => {
                option.addEventListener('click', () => {
                    const unitType = option.getAttribute('data-unit');
                    const cost = UNIT_COSTS[unitType];
                    
                    if (gameState.gold >= cost) {
                        spawnNewUnit(unitType);
                    } else {
                        alert(i18n.translate('not_enough_gold'));
                    }
                });
            });
        }
        
        function spawnNewUnit(unitType) {
            // Determine spawn position
            let x, y;
            if (unitType === 'barrier') {
                // Place barrier at the same position as the player's tower
                x = gameState.isLeftPlayer ? 100 : 980;
                y = 300;
            } else {
                x = gameState.isLeftPlayer ? 100 : 980;
                y = 250 + Math.floor(Math.random() * 300); // random 100px across middle
            }
            
            // Generate unique ID
            const unitId = Date.now() + Math.random().toString(16).slice(2);
            
            // Emit spawn unit event
            socket.emit('spawnUnit', {
                unitId,
                unitType,
                x,
                y,
                isLeftPlayer: gameState.isLeftPlayer
            });
        }
        
        function spawnUnit(unitData) {
            // Add unit to game state
            if (unitData.type === 'barrier') {
                unitData.hp = 5; // Barrier can block 5 attacks
            }
            gameState.units.push(unitData);
            
            // Create unit element
            const unitElement = document.createElement('div');
            unitElement.className = `unit ${unitData.type} ${unitData.isLeftPlayer ? 'left' : 'right'}`;
            unitElement.id = `unit-${unitData.id}`;
            unitElement.style.left = `${unitData.x}px`;
            unitElement.style.top = `${unitData.y}px`;
            unitElement.style.width = unitData.type === 'barrier' ? '40px' : '32px';
            unitElement.style.height = unitData.type === 'barrier' ? '40px' : '32px';
            unitElement.style.position = 'absolute';
            
            // Add unit image
            const unitImage = document.createElement('img');
            unitImage.src = `images/${unitData.type}.png`;
            unitImage.alt = unitData.type;
            unitImage.style.width = '100%';
            unitImage.style.height = '100%';
            unitElement.appendChild(unitImage);
            
            // Add to game field
            document.querySelector('.game-field').appendChild(unitElement);
            
            // If it's a miner, add mineral collection behavior
            if (unitData.type === 'miner') {
                setupMiner(unitData, unitElement);
            } else if (unitData.type === 'soldier') {
                setupSoldier(unitData, unitElement);
            } else if (unitData.type === 'barrier') {
                setupBarrier(unitData, unitElement);
            }
        }
        
        function setupBarrier(unitData, unitElement) {
            // Overlay the barrier image on the tower
            const towerSelector = unitData.isLeftPlayer ? '.tower.left .barrier-image' : '.tower.right .barrier-image';
            const barrierImg = document.querySelector(towerSelector);
            if (barrierImg) {
                barrierImg.style.display = 'block';
            }
            // Remove the floating barrier unit from the field (if any)
            if (unitElement && unitElement.parentNode) {
                unitElement.parentNode.removeChild(unitElement);
            }
        }
        
        // Placeholder functions for unit behaviors
        function setupMiner(unitData, unitElement) {
            // Miner behavior would go here
            console.log(`Miner ${unitData.id} is ready to mine!`);
            // Track mining state per miner
            unitData.miningInterval = null;
        }
        
        function setupSoldier(unitData, unitElement) {
            // Soldier AI: move toward nearest enemy soldier, else enemy tower
            unitData.soldierInterval = null;
        }

        // --- RPS (Rock Paper Scissors) logic ---
        let rpsHasPlayed = false;
        let rpsTimer = null;
        let rpsTimeLeft = 10;
        let rpsChoice = null;

        function resetRPSUI() {
            rpsHasPlayed = false;
            rpsChoice = null;
            document.getElementById('player-choice').textContent = '';
            document.getElementById('opponent-choice').textContent = '';
            document.getElementById('rps-message').textContent = 'Choose rock, paper, or scissors';
            document.getElementById('rps-timer').style.display = 'none';
        }

        function startRPSTimer() {
            rpsTimeLeft = 10;
            document.getElementById('rps-timer').style.display = 'block';
            document.getElementById('timer-count').textContent = rpsTimeLeft;
            if (rpsTimer) clearInterval(rpsTimer);
            rpsTimer = setInterval(() => {
                rpsTimeLeft--;
                document.getElementById('timer-count').textContent = rpsTimeLeft;
                if (rpsTimeLeft <= 0) {
                    clearInterval(rpsTimer);
                    rpsTimer = null;
                    if (!rpsHasPlayed) {
                        sendRPSChoice(null); // No choice made
                    }
                }
            }, 1000);
        }

        function sendRPSChoice(choice) {
            if (rpsHasPlayed) return;
            rpsHasPlayed = true;
            rpsChoice = choice;
            socket.emit('rpsPlay', { move: choice });
            document.getElementById('player-choice').textContent = choice ? choice : 'No choice';
            document.getElementById('rps-message').textContent = 'Waiting for opponent...';
        }

        // Add event listeners to RPS buttons
        document.querySelectorAll('.rps-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!rpsHasPlayed) {
                    sendRPSChoice(btn.getAttribute('data-choice'));
                }
            });
        });

        // Listen for RPS events from server
        socket.on('rpsMoveReceived', (data) => {
            // Optionally show feedback
        });

        socket.on('rpsResult', (data) => {
            clearInterval(rpsTimer);
            rpsTimer = null;
            let winner = data.winner;
            let resultText = '';
            let resultClass = '';
            if (winner === 'draw') {
                resultText = i18n.translate('rps_draw') || 'Draw';
                resultClass = 'rps-draw';
            } else if (winner === currentUser.username) {
                resultText = i18n.translate('rps_you_win') || 'You win!';
                resultClass = 'rps-win';
            } else {
                resultText = i18n.translate('rps_you_lose') || 'You lose!';
                resultClass = 'rps-lose';
            }
            const rpsMsg = document.getElementById('rps-message');
            rpsMsg.textContent = resultText;
            rpsMsg.className = 'rps-result-msg ' + resultClass;
            // Optionally show player/opponent choice in a subtle way
            document.getElementById('player-choice').textContent = data.player1.username === currentUser.username ? (data.player1.move || '-') : (data.player2.move || '-');
            document.getElementById('opponent-choice').textContent = data.player1.username !== currentUser.username ? (data.player1.move || '-') : (data.player2.move || '-');
            setTimeout(() => {
                socket.emit('rpsReset');
                resetRPSUI();
                startRPSTimer();
            }, 2000);
        });

        socket.on('rpsReset', () => {
            resetRPSUI();
            startRPSTimer();
        });

        // Start RPS round when game starts
        socket.on('gameStarted', (initialState) => {
            // ...existing code...
            resetRPSUI();
            startRPSTimer();
            // ...existing code...
        });

        // Animation loop for miners
        function animateMiners() {
            gameState.units.forEach(unit => {
                if (unit.type === 'miner') {
                    const unitElement = document.getElementById(`unit-${unit.id}`);
                    if (!unitElement) return;
                    // Find nearest mineral
                    const minerals = document.querySelectorAll('.mineral');
                    let closestMineral = null;
                    let minDist = Infinity;
                    minerals.forEach(mineral => {
                        const rect = mineral.getBoundingClientRect();
                        const unitRect = unitElement.getBoundingClientRect();
                        const dx = rect.left + rect.width/2 - (unitRect.left + unitRect.width/2);
                        const dy = rect.top + rect.height/2 - (unitRect.top + unitRect.height/2);
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if (dist < minDist) {
                            minDist = dist;
                            closestMineral = mineral;
                        }
                    });
                    if (closestMineral) {
                        // Move toward the mineral
                        const rect = closestMineral.getBoundingClientRect();
                        const unitRect = unitElement.getBoundingClientRect();
                        const dx = rect.left + rect.width/2 - (unitRect.left + unitRect.width/2);
                        const dy = rect.top + rect.height/2 - (unitRect.top + unitRect.height/2);
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if (dist > 24) { // Stop if within 24px of center
                            // Stop mining if moving away
                            if (unit.miningInterval) {
                                clearInterval(unit.miningInterval);
                                unit.miningInterval = null;
                            }
                            const speed = 0.5; // slower px per frame
                            const moveX = dx / dist * speed;
                            const moveY = dy / dist * speed;
                            // Update logical position
                            unit.x += moveX;
                            unit.y += moveY;
                            // Update DOM
                            unitElement.style.left = `${unit.x}px`;
                            unitElement.style.top = `${unit.y}px`;
                        } else {
                            // Start mining if not already mining
                            if (!unit.miningInterval) {
                                unit.miningInterval = setInterval(() => {
                                    // No longer emit collectMineral; server handles mining
                                }, 1000);
                            }
                        }
                    } else {
                        // No mineral found, stop mining
                        if (unit.miningInterval) {
                            clearInterval(unit.miningInterval);
                            unit.miningInterval = null;
                        }
                    }
                }
            });
            requestAnimationFrame(animateMiners);
        }
        // Start animation loop after DOM is ready
        requestAnimationFrame(animateMiners);

        // Animation loop for soldiers
        function animateSoldiers() {
            // Get all soldiers
            const leftSoldiers = gameState.units.filter(u => u.type === 'soldier' && u.isLeftPlayer);
            const rightSoldiers = gameState.units.filter(u => u.type === 'soldier' && !u.isLeftPlayer);
            // For each soldier
            gameState.units.forEach(unit => {
                if (unit.type !== 'soldier') return;
                const unitElement = document.getElementById(`unit-${unit.id}`);
                if (!unitElement) return;
                // Find target: nearest enemy soldier, else nearest enemy barrier, else enemy tower
                let target = null;
                let targetType = null;
                let minDist = Infinity;
                const isLeft = unit.isLeftPlayer;
                const enemySoldiers = isLeft ? rightSoldiers : leftSoldiers;
                const enemyBarriers = gameState.units.filter(u => u.type === 'barrier' && u.isLeftPlayer !== isLeft);
                if (enemySoldiers.length > 0) {
                    enemySoldiers.forEach(enemy => {
                        const dx = (enemy.x ?? 0) - (unit.x ?? 0);
                        const dy = (enemy.y ?? 0) - (unit.y ?? 0);
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if (dist < minDist) {
                            minDist = dist;
                            target = enemy;
                            targetType = 'soldier';
                        }
                    });
                } else if (enemyBarriers.length > 0) {
                    enemyBarriers.forEach(barrier => {
                        const dx = (barrier.x ?? 0) - (unit.x ?? 0);
                        const dy = (barrier.y ?? 0) - (unit.y ?? 0);
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if (dist < minDist) {
                            minDist = dist;
                            target = barrier;
                            targetType = 'barrier';
                        }
                    });
                } else {
                    // Target enemy tower
                    const towerX = isLeft ? 980 : 100;
                    const towerY = 300; // center
                    const dx = towerX - (unit.x ?? 0);
                    const dy = towerY - (unit.y ?? 0);
                    minDist = Math.sqrt(dx*dx + dy*dy);
                    target = { x: towerX, y: towerY };
                    targetType = 'tower';
                }
                // Move toward target
                if (minDist > 24) {
                    // Stop attacking if moving
                    if (unit.soldierInterval) {
                        clearInterval(unit.soldierInterval);
                        unit.soldierInterval = null;
                    }
                    const speed = 1.0; // soldier speed px per frame
                    const dx = (target.x ?? 0) - (unit.x ?? 0);
                    const dy = (target.y ?? 0) - (unit.y ?? 0);
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    const moveX = dx / dist * speed;
                    const moveY = dy / dist * speed;
                    unit.x += moveX;
                    unit.y += moveY;
                    unitElement.style.left = `${unit.x}px`;
                    unitElement.style.top = `${unit.y}px`;
                } else {
                    // At target
                    if (targetType === 'soldier') {
                        // Both soldiers die
                        const enemyElement = document.getElementById(`unit-${target.id}`);
                        if (enemyElement) enemyElement.remove();
                        if (unitElement) unitElement.remove();
                        gameState.units = gameState.units.filter(u => u.id !== unit.id && u.id !== target.id);
                    } else if (targetType === 'barrier') {
                        // Attack barrier: reduce hp, remove if hp <= 0
                        if (!unit.soldierInterval) {
                            unit.soldierInterval = setInterval(() => {
                                target.hp -= 1;
                                if (target.hp <= 0) {
                                    const barrierElement = document.getElementById(`unit-${target.id}`);
                                    if (barrierElement) barrierElement.remove();
                                    gameState.units = gameState.units.filter(u => u.id !== target.id);
                                    clearInterval(unit.soldierInterval);
                                    unit.soldierInterval = null;
                                }
                            }, 1000);
                        }
                    } else if (targetType === 'tower') {
                        // Start damaging tower if not already
                        if (!unit.soldierInterval) {
                            unit.soldierInterval = setInterval(() => {
                                // Damage enemy tower by 5/sec
                                const hpBar = document.querySelector(`.player-info.${isLeft ? 'right' : 'left'} .hp-fill`);
                                if (hpBar) {
                                    let width = parseFloat(hpBar.style.width) || 100;
                                    width -= 5;
                                    if (width < 0) width = 0;
                                    hpBar.style.width = width + '%';
                                    // If HP reaches 0, trigger game over
                                    if (width <= 0) {
                                        // Only emit once
                                        if (!window._gameOverEmitted) {
                                            window._gameOverEmitted = true;
                                            socket.emit('gameOver', { winner: isLeft ? 'left' : 'right' });
                                        }
                                    }
                                }
                            }, 1000);
                        }
                    }
                }
            });
            requestAnimationFrame(animateSoldiers);
        }
        // Start animation loop after DOM is ready
        requestAnimationFrame(animateSoldiers);

        // Listen for game over event from server
        socket.on('gameOver', (data) => {
            // data: { winner: 'left' | 'right' }
            let result = 'draw';
            if ((data.winner === 'left' && gameState.isLeftPlayer) || (data.winner === 'right' && !gameState.isLeftPlayer)) {
                result = 'win';
            } else if ((data.winner === 'left' && !gameState.isLeftPlayer) || (data.winner === 'right' && gameState.isLeftPlayer)) {
                result = 'lose';
            }
            window.location.href = `/ending.html?result=${result}`;
        });
    }
});