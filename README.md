# 天下太平 Online

A real-time multiplayer strategy game where players compete to achieve dominance through resource management and tactical unit deployment. The title "天下太平" means "Peace Under Heaven" in Chinese.

## Project Status

**Current Status:** In development - Addressing multiplayer socket connection issues

### Recent Progress
- Fixed critical socket connection issues where players couldn't properly join game rooms
- Resolved "user is not defined" reference error in the checkRoom handler
- Improved matchmaking system to properly update player socket IDs and join them to rooms
- Added auto-retry mechanism for ready status toggling
- Added diagnostic tools for debugging socket connection issues
- Enhanced room joining logic to better handle reconnections

### Known Issues
- Some socket event handlers may still be defined outside proper scope
- Client-side code accidentally included in server.js in some places
- Room association issues with multiple browser tabs/clients

## Features

- Clean, minimalist design with a gradient background
- Responsive layout (works on mobile devices)
- Interactive animation effects
- Complete user account system with login/signup functionality
- User rank tracking system
- Google Authentication integration
- Real-time multiplayer game modes
- ELO ranking system
- Friend system with direct challenging
- Advanced matchmaking with ELO-based pairing

## Game Modes

- **Classic** - Standard game mode with balanced gameplay
- **Insane** - Fast-paced chaos with powerful units and rapid resource generation
- **Beta** - Experimental features and unique gameplay elements

## Technologies Used

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js with Express
- **Database**: SQLite with Prisma ORM
- **Authentication**: Express-session, bcrypt, Google OAuth 2.0
- **Real-time**: Socket.IO

## Setup Instructions

### 1. Environment Variables

Create a `.env` file in the root directory with the following:

```
# Server configuration
PORT=3000
SESSION_SECRET=tianxia-taiping-secret-key

# Google OAuth credentials
GOOGLE_CLIENT_ID=76587688629-f5ukq20a7mj39elk4j6i7n14iq5s011e.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Database configuration
DATABASE_URL="file:./dev.db"
```

### 2. Google API Console Configuration

To fix the Google Authentication `redirect_uri_mismatch` error:

1. Go to [Google API Console](https://console.developers.google.com/)
2. Select your project
3. Go to "Credentials" → "OAuth 2.0 Client IDs"
4. Edit your Web client
5. Under "Authorized redirect URIs", add:
   - `http://localhost:3000/auth/google/callback`
6. Save your changes

### 3. Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Start the server
npm start
```

### 4. Usage

- The game supports three modes: Classic, Insane, and Beta
- Create custom rooms or join existing ones by ID
- Use matchmaking for automatic pairing
- Track your ELO ranking on the dashboard
- Add friends and challenge them directly to matches
