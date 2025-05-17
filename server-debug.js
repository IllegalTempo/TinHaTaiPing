// Debug wrapper for server.js
try {
  console.log('Starting server in debug mode...');
  
  // Add global unhandled exception handler
  process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    console.error(err.stack);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
    console.error('Promise:', promise);
  });
  
  // Load and run server
  require('./server.js');
  
  // Check if server is still running after 3 seconds
  setTimeout(() => {
    console.log('Server is still running after 3 seconds');
  }, 3000);
  
} catch (error) {
  console.error('Server startup failed with error:');
  console.error(error.stack);
} 