import i18n from '../i18n.js';
import { createLanguageSelector } from '../language-selector.js';

// Initialize translations
document.addEventListener('DOMContentLoaded', () => {
    i18n.init();
    createLanguageSelector('language-selector');
    
    // Add translation for title
    const titleKey = 'login';
    document.title = `${i18n.translate(titleKey)} - ${i18n.translate('title')}`;
    
    // Listen for language changes to update title
    document.addEventListener('languageChanged', () => {
        document.documentElement.lang = i18n.getCurrentLanguage();
        document.title = `${i18n.translate(titleKey)} - ${i18n.translate('title')}`;
    });
    
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        console.log('Login attempt for user:', username);
        
        try {
            console.log('Sending login request...');
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            console.log('Login response received:', response.status, response.statusText);
            
            let data;
            try {
                data = await response.json();
                console.log('Response data:', data);
            } catch (parseError) {
                console.error('Error parsing response JSON:', parseError);
                data = {};
            }
            
            if (response.ok) {
                // Login successful
                console.log('Login successful, redirecting...');
                showMessage(i18n.translate('login_success'), 'success');
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000);
            } else {
                // Login failed
                console.error('Login failed:', data.error || 'Unknown error');
                showMessage(data.error || i18n.translate('login_error'), 'error');
            }
        } catch (error) {
            console.error('Login request error:', error);
            showMessage(i18n.translate('system_error'), 'error');
        }
    });
});

function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    messageEl.style.display = 'block';
} 