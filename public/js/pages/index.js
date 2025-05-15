import i18n from '../i18n.js';
import { createLanguageSelector } from '../language-selector.js';

// Initialize the i18n system
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize language system
    i18n.init();
    
    // Create language selector
    createLanguageSelector('language-selector');
    
    // Join Room modal elements
    const joinRoomModal = document.getElementById('join-room-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const roomIdInput = document.getElementById('room-id-input');
    const submitJoinRoomBtn = document.getElementById('submit-join-room');
    const errorMessage = document.getElementById('error-message');
    const lastRoomPrompt = document.getElementById('last-room-prompt');
    const lastRoomId = document.getElementById('last-room-id');
    const rejoinRoomBtn = document.getElementById('rejoin-room-btn');
    
    let lastRoom = null;
    
    // Create Room button - check login status first
    document.getElementById('create-room-btn').addEventListener('click', async () => {
        try {
            const response = await fetch('/api/user/me');
            
            if (response.status === 401) {
                // Show error message if not logged in
                errorMessage.style.display = 'block';
                return;
            }
            
            // If logged in, proceed to create room page
            window.location.href = 'create-room.html';
        } catch (error) {
            console.error('Error checking auth status:', error);
            errorMessage.style.display = 'block';
        }
    });
    
    // Join Room button - show modal
    document.getElementById('join-room-btn').addEventListener('click', () => {
        joinRoomModal.classList.add('active');
        roomIdInput.focus();
    });
    
    // Close modal when clicking the close button
    closeModalBtn.addEventListener('click', () => {
        joinRoomModal.classList.remove('active');
    });
    
    // Close modal when clicking outside the modal content
    joinRoomModal.addEventListener('click', (e) => {
        if (e.target === joinRoomModal) {
            joinRoomModal.classList.remove('active');
        }
    });
    
    // Handle rejoin room button
    rejoinRoomBtn.addEventListener('click', () => {
        if (lastRoom) {
            window.location.href = `/game-room.html?roomId=${lastRoom}`;
        }
    });
    
    // Handle join room form submission
    submitJoinRoomBtn.addEventListener('click', async () => {
        const roomId = roomIdInput.value.trim();
        if (roomId) {
            try {
                // Check if user is logged in
                const response = await fetch('/api/user/me');
                
                if (response.status === 401) {
                    // Show error message if not logged in
                    errorMessage.style.display = 'block';
                    return;
                }
                
                // Get user data
                const data = await response.json();
                
                // Redirect to game room page with room ID
                window.location.href = `/game-room.html?roomId=${roomId}`;
            } catch (error) {
                console.error('Error joining room:', error);
                errorMessage.style.display = 'block';
            }
        } else {
            roomIdInput.focus();
        }
    });
    
    // Allow pressing Enter to submit the form
    roomIdInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            submitJoinRoomBtn.click();
        }
    });
    
    try {
        // Check if user is logged in
        const response = await fetch('/api/user/me');
        
        if (response.status !== 401) {
            // User is logged in, update the auth links
            const data = await response.json();
            const authLinks = document.getElementById('auth-links');
            authLinks.innerHTML = `
                <a href="/dashboard.html" id="welcome-user" data-i18n="user_profile"></a>
                <a href="#" id="logout-link" data-i18n="logout"></a>
            `;
            
            // Update welcome text
            document.getElementById('welcome-user').textContent = `${i18n.translate('welcome')}, ${data.username}`;
            
            // Apply translations to newly created elements
            i18n.applyTranslations();
            
            // Add logout functionality
            document.getElementById('logout-link').addEventListener('click', async (e) => {
                e.preventDefault();
                
                try {
                    await fetch('/api/logout', {
                        method: 'POST'
                    });
                    window.location.reload();
                } catch (error) {
                    console.error('Logout failed', error);
                }
            });
            
            // Check for last room
            try {
                const lastRoomResponse = await fetch('/api/user/last-room');
                if (lastRoomResponse.ok) {
                    const lastRoomData = await lastRoomResponse.json();
                    
                    if (lastRoomData.hasLastRoom && lastRoomData.roomId) {
                        lastRoom = lastRoomData.roomId;
                        lastRoomId.textContent = lastRoom;
                        lastRoomPrompt.style.display = 'block';
                    }
                }
            } catch (error) {
                console.error('Error checking last room:', error);
            }
        }
    } catch (error) {
        console.error('Error checking auth status', error);
    }
    
    // Listen for language changes
    document.addEventListener('languageChanged', (e) => {
        // Update document language
        document.documentElement.lang = e.detail.language;
        
        // Update dynamic content that isn't handled by data-i18n
        const welcomeUser = document.getElementById('welcome-user');
        if (welcomeUser) {
            // The username needs to be preserved
            const username = welcomeUser.textContent.split(', ')[1];
            welcomeUser.textContent = `${i18n.translate('welcome')}, ${username}`;
        }
    });
}); 