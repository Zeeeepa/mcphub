#!/usr/bin/env node

/**
 * MCPhub Client Configuration Generator
 * Command-line utility to generate MCP client configurations
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Command line argument parsing
const args = process.argv.slice(2);
const options = {};

// Parse command line arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const value = args[i + 1];
    
    if (value && !value.startsWith('--')) {
      options[key] = value;
      i++; // Skip next argument as it's the value
    } else {
      options[key] = true;
    }
  }
}

// Default configuration
const defaults = {
  domain: 'localhost',
  port: '3000',
  protocol: 'http',
  serverName: 'MCPhub',
  format: 'json',
  output: null,
  deployment: 'local',
  generateApiKey: false,
};

// Merge options with defaults
const config = { ...defaults, ...options };

// Help text
const helpText = `
MCPhub Client Configuration Generator

Usage: node generate-client-config.js [options]

Options:
  --domain <domain>        Domain name (default: localhost)
  --port <port>           Port number (default: 3000)
  --protocol <protocol>   Protocol http/https (default: http)
  --server-name <name>    Server name in config (default: MCPhub)
  --api-key <key>         API key for authentication
  --group <group>         Generate config for specific group
  --deployment <type>     Deployment type: local, wsl2, vps, cloudflare
  --format <format>       Output format: json, yaml, env (default: json)
  --output <file>         Output file (default: stdout)
  --generate-api-key      Generate a random API key
  --smart-routing         Use smart routing endpoint
  --help                  Show this help message

Examples:
  # Basic local configuration
  node generate-client-config.js

  # Configuration for Cloudflare deployment
  node generate-client-config.js --deployment cloudflare --domain pixeliumperfecto.co.uk --api-key your-key

  # Generate with random API key
  node generate-client-config.js --generate-api-key --output mcphub-config.json

  # YAML format for specific group
  node generate-client-config.js --group production --format yaml

  # Smart routing configuration
  node generate-client-config.js --smart-routing --domain your-domain.com --protocol https
`;

// Show help if requested
if (config.help) {
  console.log(helpText);
  process.exit(0);
}

// Generate API key if requested
if (config.generateApiKey || config['generate-api-key']) {
  config.apiKey = crypto.randomBytes(32).toString('hex');
  console.error(`Generated API Key: ${config.apiKey}`);
}

// Deployment-specific configurations
const deploymentConfigs = {
  local: {
    domain: 'localhost',
    port: '3000',
    protocol: 'http',
  },
  wsl2: {
    domain: 'localhost',
    port: '3000',
    protocol: 'http',
  },
  vps: {
    domain: config.domain !== 'localhost' ? config.domain : 'your-server.com',
    protocol: 'https',
    port: null,
  },
  cloudflare: {
    domain: config.domain !== 'localhost' ? config.domain : 'your-domain.com',
    protocol: 'https',
    port: null,
  },
};

// Apply deployment-specific settings
if (deploymentConfigs[config.deployment]) {
  Object.assign(config, deploymentConfigs[config.deployment], {
    // Don't override explicitly set options
    ...Object.fromEntries(
      Object.entries(options).filter(([key]) => key !== 'deployment')
    ),
  });
}

// Build base URL
const portSuffix = config.port && config.protocol === 'http' && config.port !== '80' ? `:${config.port}` : '';
const baseUrl = `${config.protocol}://${config.domain}${portSuffix}`;

// Generate configuration
function generateConfig() {
  const mcpConfig = {
    mcpServers: {},
  };

  let endpoint = '/sse';
  let serverName = config.serverName || config['server-name'] || 'MCPhub';

  // Handle different endpoint types
  if (config.smartRouting || config['smart-routing']) {
    endpoint = '/sse/$smart';
    serverName = `${serverName}_Smart`;
  } else if (config.group) {
    endpoint = `/sse/${config.group}`;
    serverName = `${serverName}_${config.group}`;
  }

  // Build server configuration
  const serverConfig = {
    type: 'sse',
    url: `${baseUrl}${endpoint}`,
    keepAliveInterval: 60000,
    owner: 'admin',
  };

  // Add API key if provided
  if (config.apiKey || config['api-key']) {
    serverConfig.env = config.apiKey || config['api-key'];
  }

  mcpConfig.mcpServers[serverName] = serverConfig;

  return mcpConfig;
}

// Format output
function formatOutput(config, format) {
  switch (format) {
    case 'json':
      return JSON.stringify(config, null, 2);
    
    case 'yaml':
      return toYaml(config);
    
    case 'env':
      return toEnvVars(config);
    
    default:
      return JSON.stringify(config, null, 2);
  }
}

// Convert to YAML format
function toYaml(config) {
  let yaml = 'mcpServers:\n';
  
  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    yaml += `  ${name}:\n`;
    yaml += `    type: "${serverConfig.type}"\n`;
    yaml += `    url: "${serverConfig.url}"\n`;
    
    if (serverConfig.keepAliveInterval) {
      yaml += `    keepAliveInterval: ${serverConfig.keepAliveInterval}\n`;
    }
    
    if (serverConfig.owner) {
      yaml += `    owner: "${serverConfig.owner}"\n`;
    }
    
    if (serverConfig.env) {
      yaml += `    env: "${serverConfig.env}"\n`;
    }
  }
  
  return yaml;
}

// Convert to environment variables
function toEnvVars(config) {
  let envVars = '';
  
  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    const prefix = `MCP_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
    
    envVars += `${prefix}_TYPE="${serverConfig.type}"\n`;
    envVars += `${prefix}_URL="${serverConfig.url}"\n`;
    
    if (serverConfig.keepAliveInterval) {
      envVars += `${prefix}_KEEP_ALIVE_INTERVAL="${serverConfig.keepAliveInterval}"\n`;
    }
    
    if (serverConfig.owner) {
      envVars += `${prefix}_OWNER="${serverConfig.owner}"\n`;
    }
    
    if (serverConfig.env) {
      envVars += `${prefix}_API_KEY="${serverConfig.env}"\n`;
    }
  }
  
  return envVars;
}

// Generate and output configuration
try {
  const generatedConfig = generateConfig();
  const formattedOutput = formatOutput(generatedConfig, config.format);
  
  if (config.output) {
    fs.writeFileSync(config.output, formattedOutput);
    console.error(`Configuration written to: ${config.output}`);
    
    // Also show a preview
    console.error('\nGenerated configuration:');
    console.error(formattedOutput.split('\n').slice(0, 10).join('\n'));
    if (formattedOutput.split('\n').length > 10) {
      console.error('...');
    }
  } else {
    console.log(formattedOutput);
  }
  
  // Show usage instructions
  if (config.generateApiKey || config['generate-api-key']) {
    console.error('\n📋 USAGE INSTRUCTIONS:');
    console.error('1. Save the generated API key securely');
    console.error('2. Add the API key to your MCPhub dashboard');
    console.error('3. Use the configuration in your MCP client');
    console.error(`4. Test connection: curl -H "Authorization: Bearer ${config.apiKey}" ${baseUrl}/health`);
  }
  
} catch (error) {
  console.error('Error generating configuration:', error.message);
  process.exit(1);
}

