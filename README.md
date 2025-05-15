# 天下太平 - TinHaTaiPing

A traditional Chinese game platform.

## Deployment Instructions for Vercel

This project is configured to deploy on Vercel. Follow these steps to deploy your own instance:

### Prerequisites

1. A [Vercel](https://vercel.com/) account
2. A PostgreSQL database (You can use Vercel Postgres or any other provider)

### Deployment Steps

1. **Fork or clone this repository to your GitHub account**

2. **Connect to Vercel**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your GitHub repository
   - Select the repository

3. **Configure Environment Variables**
   Add the following environment variables in the Vercel project settings:

   - `DATABASE_URL`: Your PostgreSQL connection string
   - `SESSION_SECRET`: A secret string for securing sessions
   - `NODE_ENV`: Set to "production"

4. **Deploy**
   - Click "Deploy"
   - Vercel will automatically run the build and deployment process

### Database Setup

1. **Migrations**
   After the first deployment, you'll need to run the database migrations:

   ```bash
   npx prisma migrate deploy
   ```

   You can run this from the Vercel CLI or configure it to run in the build step.

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/TinHaTaiPing.git
   cd TinHaTaiPing
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on the `.env.example` template

4. Run the development server:
   ```bash
   npm start
   ```

## Features

- Real-time multiplayer gameplay with Socket.IO
- User authentication system
- Room-based game sessions
- Admin dashboard

## Technologies

- Node.js
- Express
- Socket.IO
- Prisma ORM
- PostgreSQL
