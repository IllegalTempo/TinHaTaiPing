const fs = require('fs');
const path = require('path');

console.log('\n=== Google OAuth Environment Setup ===\n');

// Find client secret file
const files = fs.readdirSync(__dirname);
const clientSecretFile = files.find(file => file.startsWith('client_secret') && file.endsWith('.json'));

if (!clientSecretFile) {
    console.error('Error: No client_secret file found in the current directory.');
    console.log('Please download your OAuth client credentials JSON file from the Google Cloud Console.');
    process.exit(1);
}

console.log(`Found client secret file: ${clientSecretFile}`);

try {
    // Read and parse the client secret file
    const clientSecretContent = fs.readFileSync(path.join(__dirname, clientSecretFile), 'utf8');
    const clientSecret = JSON.parse(clientSecretContent);
    
    // Check if it has web configuration
    if (!clientSecret.web) {
        console.error('Error: Invalid client secret file format. Missing "web" configuration.');
        process.exit(1);
    }
    
    // Create or update .env file
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    
    // Check if .env already exists
    if (fs.existsSync(envPath)) {
        console.log('Existing .env file found. Updating OAuth settings...');
        envContent = fs.readFileSync(envPath, 'utf8');
        
        // Replace or add Google OAuth settings
        envContent = envContent.replace(/GOOGLE_CLIENT_ID=.*\n/, '');
        envContent = envContent.replace(/GOOGLE_CLIENT_SECRET=.*\n/, '');
        envContent = envContent.replace(/GOOGLE_CALLBACK_URL=.*\n/, '');
        
        // Add a newline if needed
        if (!envContent.endsWith('\n')) {
            envContent += '\n';
        }
    } else {
        console.log('Creating new .env file with default settings...');
        envContent = `SESSION_SECRET=tianxia-taiping-secret-key
DEBUG_MODE=false
VERBOSE_LOGGING=false
PORT=3000

`;
    }
    
    // Add Google OAuth settings
    envContent += `# Google OAuth settings
GOOGLE_CLIENT_ID=${clientSecret.web.client_id}
GOOGLE_CLIENT_SECRET=${clientSecret.web.client_secret}
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
`;
    
    // Write updated .env file
    fs.writeFileSync(envPath, envContent);
    
    console.log('\nGoogle OAuth settings have been successfully added to .env file.');
    console.log('\nIMPORTANT: Make sure you have configured the following Authorized Redirect URIs in Google Cloud Console:');
    console.log('1. http://localhost:3000/auth/google/callback');
    console.log('2. http://localhost:3000/auth/google/link/callback');
    console.log('3. https://worldpeaceol.oscarchw.com/auth/google/callback');
    console.log('4. https://worldpeaceol.oscarchw.com/auth/google/link/callback');
    console.log('\nIf not configured, please add them in the Google Cloud Console > APIs & Services > Credentials');
    
} catch (error) {
    console.error(`Error processing client secret file: ${error.message}`);
    process.exit(1);
} 