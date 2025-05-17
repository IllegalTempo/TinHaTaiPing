const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ANSI color codes for prettier console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
};

// Print a styled header
console.log('\n' + colors.bright + colors.cyan + '==================================' + colors.reset);
console.log(colors.bright + colors.cyan + '    天下太平 Web Server Starter' + colors.reset);
console.log(colors.bright + colors.cyan + '==================================' + colors.reset + '\n');

// Check if server.js exists
const serverPath = path.join(__dirname, 'server.js');
if (!fs.existsSync(serverPath)) {
  console.error(colors.red + 'ERROR: server.js file not found!' + colors.reset);
  console.error('Make sure you are running this script from the website directory.');
  process.exit(1);
}

// Load package.json to get required dependencies
const packageJsonPath = path.join(__dirname, 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error(colors.red + 'ERROR: package.json file not found!' + colors.reset);
  process.exit(1);
}

const packageJson = require(packageJsonPath);
const requiredDeps = Object.keys(packageJson.dependencies || {});

// Check for missing dependencies
console.log(colors.yellow + 'Checking dependencies...' + colors.reset);
const missingDeps = [];

for (const dep of requiredDeps) {
  try {
    require.resolve(dep);
  } catch (error) {
    missingDeps.push(dep);
  }
}

// Install missing dependencies if any
if (missingDeps.length > 0) {
  console.log(colors.yellow + `Missing dependencies found: ${missingDeps.join(', ')}` + colors.reset);
  console.log(colors.yellow + 'Installing missing dependencies...' + colors.reset);
  
  const installResult = spawnSync('npm', ['install'], { 
    stdio: 'inherit', 
    shell: true 
  });
  
  if (installResult.status !== 0) {
    console.error(colors.red + 'ERROR: Failed to install dependencies.' + colors.reset);
    process.exit(1);
  }
  
  console.log(colors.green + '✓ Dependencies installed successfully.' + colors.reset);
} else {
  console.log(colors.green + '✓ All dependencies are installed.' + colors.reset);
}

// Check if Prisma is initialized
const prismaDir = path.join(__dirname, 'prisma');
const devDbPath = path.join(prismaDir, 'dev.db');
const migrationsDir = path.join(prismaDir, 'migrations');
const schemaPath = path.join(prismaDir, 'schema.prisma');
const clientPath = path.join(prismaDir, 'client.js');

// Check if required Prisma directories and files exist
const isPrismaSchemaPresent = fs.existsSync(schemaPath);
const isMigrationsDirPresent = fs.existsSync(migrationsDir) && fs.readdirSync(migrationsDir).length > 0;
const isClientPresent = fs.existsSync(clientPath);

// Function to generate Prisma client
function runPrismaGenerate() {
  console.log(colors.yellow + 'Generating Prisma client...' + colors.reset);
  const result = spawnSync('npx', ['prisma', 'generate'], { 
    stdio: 'inherit', 
    shell: true 
  });
  
  if (result.status !== 0) {
    console.error(colors.red + 'ERROR: Failed to generate Prisma client.' + colors.reset);
    process.exit(1);
  }
  
  console.log(colors.green + '✓ Prisma client generated successfully.' + colors.reset);
}

// Function to run Prisma migrations
function runPrismaMigrate() {
  console.log(colors.yellow + 'Running Prisma migrations...' + colors.reset);
  
  // First try the deploy command which is safer
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { 
    stdio: 'inherit', 
    shell: true 
  });
  
  if (result.status !== 0) {
    console.error(colors.red + 'WARNING: Failed to deploy Prisma migrations.' + colors.reset);
    console.log(colors.yellow + 'Trying database push instead...' + colors.reset);
    
    // If deploy fails, try db push
    const pushResult = spawnSync('npx', ['prisma', 'db', 'push'], { 
      stdio: 'inherit', 
      shell: true 
    });
    
    if (pushResult.status !== 0) {
      console.error(colors.red + 'ERROR: Failed to initialize database.' + colors.reset);
      process.exit(1);
    }
  }
  
  console.log(colors.green + '✓ Database schema updated successfully.' + colors.reset);
}

// Initialize Prisma if needed
console.log(colors.yellow + 'Checking Prisma setup...' + colors.reset);

if (!isPrismaSchemaPresent) {
  console.error(colors.red + 'ERROR: Prisma schema not found at ' + schemaPath + colors.reset);
  process.exit(1);
}

// Generate client if not present
if (!isClientPresent) {
  console.log(colors.yellow + 'Prisma client not found. Generating...' + colors.reset);
  runPrismaGenerate();
} else {
  console.log(colors.green + '✓ Prisma client found.' + colors.reset);
}

// Run migrations if needed
if (!fs.existsSync(devDbPath) || !isMigrationsDirPresent) {
  console.log(colors.yellow + 'Database or migrations not found. Initializing database...' + colors.reset);
  runPrismaMigrate();
} else {
  console.log(colors.green + '✓ Database and migrations found.' + colors.reset);
}

// Check for .env file and create if it doesn't exist
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.log(colors.yellow + '.env file not found. Checking for client_secret file...' + colors.reset);
  
  // Find the Google client secret file
  const files = fs.readdirSync(__dirname);
  const clientSecretFile = files.find(file => file.startsWith('client_secret') && file.endsWith('.json'));
  
  if (clientSecretFile) {
    console.log(colors.yellow + `Found client secret file: ${clientSecretFile}. Creating .env file...` + colors.reset);
    
    try {
      const clientSecretContent = fs.readFileSync(path.join(__dirname, clientSecretFile), 'utf8');
      const clientSecret = JSON.parse(clientSecretContent);
      
      // Create .env file with Google credentials
      const envContent = `SESSION_SECRET=tianxia-taiping-secret-key
PORT=3000
DEBUG_MODE=false
VERBOSE_LOGGING=false
GOOGLE_CLIENT_ID=${clientSecret.web.client_id}
GOOGLE_CLIENT_SECRET=${clientSecret.web.client_secret}
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback`;
      
      fs.writeFileSync(envPath, envContent);
      console.log(colors.green + '✓ .env file created with Google credentials.' + colors.reset);
    } catch (error) {
      console.error(colors.yellow + 'Warning: Failed to create .env file from client secret.' + colors.reset);
      console.error('You may need to create the .env file manually.');
    }
  } else {
    console.log(colors.yellow + 'Warning: No client_secret file found. Creating basic .env file...' + colors.reset);
    
    // Create basic .env file
    const basicEnvContent = `SESSION_SECRET=tianxia-taiping-secret-key
PORT=3000
DEBUG_MODE=false
VERBOSE_LOGGING=false`;
    fs.writeFileSync(envPath, basicEnvContent);
    console.log(colors.yellow + 'Created basic .env file. You may need to update it with Google credentials.' + colors.reset);
  }
}

console.log(colors.green + '✓ Server ready to start' + colors.reset);
console.log('\n' + colors.yellow + 'Starting server...' + colors.reset + '\n');

let serverProcess = null;

function startServer() {
  // Start the server as a separate process
  serverProcess = spawn('node', ['server.js'], { stdio: 'inherit' });

  // Server URL
  console.log(colors.bright + '\nServer will be available at: ' + 
    colors.cyan + 'http://localhost:3000' + colors.reset);
  console.log(colors.dim + 'Press Ctrl+R to restart the server' + colors.reset + '\n');

  // Handle server process events
  serverProcess.on('close', (code) => {
    if (code !== 0 && code !== null) { // null means process was terminated by us
      console.log(colors.red + `\nServer process exited with code ${code}` + colors.reset);
    } else {
      console.log(colors.green + '\nServer stopped successfully.' + colors.reset);
    }
  });
}

// Initial server start
startServer();

// Handle keyboard input to restart server
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.on('data', (data) => {
    // Ctrl+R (18 in decimal) to restart server
    if (data.length === 1 && data[0] === 18) {
      console.log(colors.yellow + '\nRestarting server...' + colors.reset);
      if (serverProcess) {
        serverProcess.kill();
        setTimeout(startServer, 1000); // Restart after a brief delay
      }
    }
    
    // Ctrl+C (3 in decimal) to exit
    if (data.length === 1 && data[0] === 3) {
      if (serverProcess) {
        serverProcess.kill();
      }
      process.exit(0);
    }
  });
}

