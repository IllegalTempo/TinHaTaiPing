const { PrismaClient } = require('@prisma/client');

// Initialize Prisma Client with logging in development
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Handle potential connection issues
prisma.$connect()
  .then(() => {
    console.log('Prisma Client connected successfully to the database');
  })
  .catch((e) => {
    console.error('Failed to connect Prisma Client to the database', e);
  });

// Add a ping function to test connection
prisma.ping = async () => {
  try {
    // Try a simple query to verify the connection
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    return { connected: true, time: new Date() };
  } catch (error) {
    return { connected: false, error: error.message };
  }
};

module.exports = prisma; 