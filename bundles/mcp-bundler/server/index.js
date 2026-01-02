#!/usr/bin/env node

/**
 * MCP Bundler Wrapper Server
 * 
 * A minimal wrapper that demonstrates using @wrtnlabs/mcp-bundler to create
 * a composite MCP server combining multiple sub-servers.
 * 
 * This example bundles Mercury Spec Ops and MCP Docs Server into a single
 * unified MCP server endpoint.
 */

import { bundler, RequiredEnv } from "@wrtnlabs/mcp-bundler";

/**
 * Environment Variables Configuration
 * 
 * This bundler configuration supports the following environment variables:
 * 
 * For MCP Docs Server (if included):
 * - CONTEXT_FILE: Path to the markdown documentation file (required if using docs server)
 * 
 * For Mercury Spec Ops:
 * - No environment variables required
 * 
 * You can customize which sub-servers are included by modifying the mcpServers
 * configuration below.
 */

export const server = bundler({
  name: "MCP Bundler Example",
  version: "1.0.0",
  mcpServers: {
    // Mercury Spec Ops - No environment variables required
    "mercury-spec-ops": {
      command: "npx",
      args: ["-y", "@n0zer0d4y/mercury-spec-ops@latest"],
      env: {},
    },
    
    // MCP Docs Server - Requires CONTEXT_FILE environment variable
    // Uncomment and configure if you want to include docs server:
    /*
    "docs-server": {
      command: "python3",
      args: ["-m", "mcp.server.fastmcp", "path/to/mcp_context_server.py"],
      env: {
        CONTEXT_FILE: RequiredEnv, // User must provide this
      },
    },
    */
    
    // Add more MCP servers here as needed
    // Example with API key:
    /*
    "example-api-server": {
      command: "npx",
      args: ["-y", "example-mcp-server"],
      env: {
        API_KEY: RequiredEnv,
        API_URL: "https://api.example.com",
      },
    },
    */
  },
})();

// Run the server if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.error("Starting MCP Bundler server...");
  console.error("Configured sub-servers:", Object.keys(server.mcpServers || {}));
}

