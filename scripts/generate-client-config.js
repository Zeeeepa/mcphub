#!/usr/bin/env node

/**
 * MCPhub Client Configuration Generator
 * 
 * Generates client configuration for connecting to MCPhub via Cloudflare
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  deployment: 'local',
  domain: 'pixeliumperfecto.co.uk',
  port: 3000,
  output: 'mcphub-config.json',
  generateApiKey: false
};

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--deployment' && i + 1 < args.length) {
    options.deployment = args[++i];
  } else if (arg === '--domain' && i + 1 < args.length) {
    options.domain = args[++i];
  } else if (arg === '--port' && i + 1 < args.length) {
    options.port = parseInt(args[++i], 10);
  } else if (arg === '--output' && i + 1 < args.length) {
    options.output = args[++i];
  } else if (arg === '--generate-api-key') {
    options.generateApiKey = true;
  } else if (arg === '--help') {
    printHelp();
    process.exit(0);
  }
}

// Print help
function printHelp() {
  console.log(`
MCPhub Client Configuration Generator

Usage:
  node generate-client-config.js [options]

Options:
  --deployment <type>    Deployment type: local, cloudflare (default: local)
  --domain <domain>      Domain name (default: pixeliumperfecto.co.uk)
  --port <port>          Port number for local deployment (default: 3000)
  --output <file>        Output file name (default: mcphub-config.json)
  --generate-api-key     Generate a new API key
  --help                 Show this help message

Examples:
  node generate-client-config.js --deployment cloudflare --domain example.com
  node generate-client-config.js --deployment local --port 8080
  `);
}

// Generate API key
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

// Generate client configuration
function generateConfig() {
  let url;
  let apiKey = '';
  
  // Generate URL based on deployment type
  if (options.deployment === 'cloudflare') {
    url = `https://${options.domain}/sse`;
  } else {
    url = `http://localhost:${options.port}/sse`;
  }
  
  // Generate API key if requested
  if (options.generateApiKey) {
    apiKey = generateApiKey();
    console.log(`Generated API key: ${apiKey}`);
    console.log('Make sure to add this API key to your MCPhub server configuration!');
  }
  
  // Create configuration object
  const config = {
    mcpServers: {
      MCPhub: {
        type: 'sse',
        url,
        keepAliveInterval: 60000,
        owner: 'admin'
      }
    }
  };
  
  // Add API key if generated
  if (apiKey) {
    config.mcpServers.MCPhub.env = apiKey;
  }
  
  return config;
}

// Write configuration to file
function writeConfig(config) {
  const outputPath = path.resolve(options.output);
  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
  console.log(`Configuration written to ${outputPath}`);
}

// Main function
function main() {
  console.log('Generating MCPhub client configuration...');
  console.log(`Deployment type: ${options.deployment}`);
  console.log(`Domain: ${options.domain}`);
  
  if (options.deployment === 'local') {
    console.log(`Port: ${options.port}`);
  }
  
  const config = generateConfig();
  writeConfig(config);
  
  console.log('Configuration generated successfully!');
}

// Run main function
main();

