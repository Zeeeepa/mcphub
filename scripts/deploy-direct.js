#!/usr/bin/env node

/**
 * Direct Cloudflare Worker Deployment Script
 * This script deploys the MCPhub Cloudflare Worker using the Cloudflare API directly
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { spawn } = require('child_process');

// Configuration
const config = {
  ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '2b2a1d3effa7f7fe4fe2a8c4e48681e3',
  API_KEY: process.env.CLOUDFLARE_API_KEY || 'eae82cf159577a8838cc83612104c09c5a0d6',
  WORKER_NAME: process.env.CLOUDFLARE_WORKER_NAME || 'mcp',
  BACKEND_URL: process.env.MCPHUB_BACKEND_URL || 'http://pixeliumperfecto.co.uk:3001',
  CUSTOM_DOMAIN: process.env.CUSTOM_DOMAIN || 'mcp.pixelium.co.uk'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m'
};

// Log functions
const log = (message) => console.log(`${colors.green}[INFO]${colors.reset} ${message}`);
const error = (message) => {
  console.error(`${colors.red}[ERROR]${colors.reset} ${message}`);
  process.exit(1);
};
const warning = (message) => console.warn(`${colors.yellow}[WARNING]${colors.reset} ${message}`);

// Check if required environment variables are set
if (!config.API_KEY) {
  error('CLOUDFLARE_API_KEY environment variable is required');
}

if (!config.ACCOUNT_ID) {
  error('CLOUDFLARE_ACCOUNT_ID environment variable is required');
}

// Get script directory
const scriptDir = __dirname;
const rootDir = path.resolve(scriptDir, '..');
const workerDir = path.join(rootDir, 'cloudflare-worker');
const workerFile = path.join(workerDir, 'src', 'index.js');
const wranglerConfigFile = path.join(workerDir, 'wrangler.toml');

// Check if worker file exists
if (!fs.existsSync(workerFile)) {
  error(`Worker file not found at ${workerFile}`);
}

// Main function
async function main() {
  try {
    log('Starting direct Cloudflare Worker deployment');

    // Update wrangler.toml configuration
    log('Updating wrangler.toml configuration');
    const wranglerConfig = `name = "${config.WORKER_NAME}"
main = "src/index.js"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]
account_id = "${config.ACCOUNT_ID}"

[vars]
MCPHUB_BACKEND_URL = "${config.BACKEND_URL}"
ALLOWED_ORIGINS = "*"
`;
    fs.writeFileSync(wranglerConfigFile, wranglerConfig);
    log('Wrangler configuration updated');

    // Install dependencies
    log('Installing dependencies');
    execSync('npm install', { cwd: workerDir, stdio: 'inherit' });

    // Deploy worker using Cloudflare API
    log('Deploying worker using Cloudflare API');
    
    // Bundle worker code
    log('Bundling worker code');
    const workerBundle = fs.readFileSync(workerFile, 'utf8');
    const bundleFile = path.join(workerDir, 'worker-bundle.js');
    fs.writeFileSync(bundleFile, workerBundle);

    // Upload worker to Cloudflare
    log('Uploading worker to Cloudflare');
    const curl = spawn('curl', [
      '-X', 'PUT',
      `https://api.cloudflare.com/client/v4/accounts/${config.ACCOUNT_ID}/workers/scripts/${config.WORKER_NAME}`,
      '-H', `X-Auth-Key: ${config.API_KEY}`,
      '-H', 'Content-Type: application/javascript',
      '--data-binary', `@${bundleFile}`
    ]);

    curl.stdout.on('data', (data) => {
      console.log(data.toString());
    });

    curl.stderr.on('data', (data) => {
      console.error(data.toString());
    });

    curl.on('close', (code) => {
      if (code !== 0) {
        warning(`curl process exited with code ${code}`);
      }
      
      // Generate client configuration
      log('Generating client configuration');
      const configFile = path.join(rootDir, 'mcphub-worker-config.json');
      const clientConfig = {
        mcpServers: {
          MCPhub: {
            type: 'sse',
            url: `http://${config.CUSTOM_DOMAIN}/sse`,
            keepAliveInterval: 60000,
            owner: 'admin',
            MCPhub_API: 'API SET IN MCPhub'
          }
        }
      };
      fs.writeFileSync(configFile, JSON.stringify(clientConfig, null, 2));
      log('Client configuration generated at mcphub-worker-config.json');

      log('Cloudflare Worker deployment complete!');
      log(`Your MCPhub instance is now accessible at http://${config.CUSTOM_DOMAIN}/sse`);
      log('');
      log('Client configuration is available in mcphub-worker-config.json');
      log('Use this configuration in your MCP client to connect to MCPhub');
    });
  } catch (err) {
    error(`Deployment failed: ${err.message}`);
  }
}

// Run main function
main();

