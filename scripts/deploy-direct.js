#!/usr/bin/env node

/**
 * Direct Cloudflare Worker Deployment Script
 * Uses Cloudflare API directly to deploy the worker
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const workerDir = path.join(rootDir, 'cloudflare-worker');

// Configuration
const config = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '2b2a1d3effa7f7fe4fe2a8c4e48681e3',
  apiKey: process.env.CLOUDFLARE_API_KEY || 'eae82cf159577a8838cc83612104c09c5a0d6',
  workerName: process.env.CLOUDFLARE_WORKER_NAME || 'mcp',
  workerUrl: process.env.CLOUDFLARE_WORKER_URL || 'https://mcp.pixeliumperfecto.workers.dev',
  backendUrl: process.env.MCPHUB_BACKEND_URL || 'http://pixeliumperfecto.co.uk:3001'
};

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Log functions
function log(message) {
  console.log(`${colors.green}[INFO]${colors.reset} ${message}`);
}

function error(message) {
  console.error(`${colors.red}[ERROR]${colors.reset} ${message}`);
}

function warning(message) {
  console.warn(`${colors.yellow}[WARNING]${colors.reset} ${message}`);
}

// Main function
async function main() {
  try {
    log('Starting direct Cloudflare Worker deployment');
    
    // Check if required environment variables are set
    if (!config.apiKey) {
      error('CLOUDFLARE_API_KEY environment variable is required');
      process.exit(1);
    }
    
    if (!config.accountId) {
      error('CLOUDFLARE_ACCOUNT_ID environment variable is required');
      process.exit(1);
    }
    
    // Update wrangler.toml with current configuration
    log('Updating wrangler.toml configuration');
    
    const wranglerConfig = `name = "${config.workerName}"
main = "src/index.js"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

account_id = "${config.accountId}"

[vars]
MCPHUB_BACKEND_URL = "${config.backendUrl}"
ALLOWED_ORIGINS = "*"`;
    
    fs.writeFileSync(path.join(workerDir, 'wrangler.toml'), wranglerConfig);
    log('Wrangler configuration updated');
    
    // Install dependencies
    log('Installing dependencies');
    process.chdir(workerDir);
    execSync('npm install', { stdio: 'inherit' });
    
    // Deploy using curl
    log('Deploying worker using Cloudflare API');
    
    // Bundle the worker
    log('Bundling worker code');
    const workerCode = fs.readFileSync(path.join(workerDir, 'src', 'index.js'), 'utf8');
    
    // Create a temporary file with the worker code
    const tempFile = path.join(workerDir, 'worker-bundle.js');
    fs.writeFileSync(tempFile, workerCode);
    
    // Deploy using curl
    log('Uploading worker to Cloudflare');
    const curlCommand = `curl -X PUT "https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/scripts/${config.workerName}" \\
      -H "Authorization: Bearer ${config.apiKey}" \\
      -F "metadata={\\"body_part\\":\\"script\\",\\"bindings\\":[{\\"name\\":\\"MCPHUB_BACKEND_URL\\",\\"type\\":\\"plain_text\\",\\"text\\":\\"${config.backendUrl}\\"},{\\"name\\":\\"ALLOWED_ORIGINS\\",\\"type\\":\\"plain_text\\",\\"text\\":\\"*\\"}]}" \\
      -F "script=@${tempFile}"`;
    
    try {
      execSync(curlCommand, { stdio: 'inherit' });
      log('Worker deployed successfully');
      
      // Clean up temporary file
      fs.unlinkSync(tempFile);
      
      // Generate client configuration
      log('Generating client configuration');
      process.chdir(rootDir);
      
      const clientConfig = {
        mcpServers: {
          MCPhub: {
            type: 'sse',
            url: `${config.workerUrl}/sse`,
            keepAliveInterval: 60000,
            owner: 'admin'
          }
        }
      };
      
      fs.writeFileSync(path.join(rootDir, 'mcphub-worker-config.json'), JSON.stringify(clientConfig, null, 2));
      log('Client configuration generated at mcphub-worker-config.json');
      
      // Final instructions
      log('Cloudflare Worker deployment complete!');
      log(`Your MCPhub instance is now accessible at ${config.workerUrl}/sse`);
      log('');
      log('Client configuration is available in mcphub-worker-config.json');
      log('Use this configuration in your MCP client to connect to MCPhub');
    } catch (err) {
      error(`Failed to deploy worker: ${err.message}`);
      process.exit(1);
    }
  } catch (err) {
    error(`Deployment failed: ${err.message}`);
    process.exit(1);
  }
}

// Run main function
main();

