# MCP Bundler MCPB Bundle

Combine multiple MCP servers into a single unified endpoint.

## Overview

MCP Bundler is a powerful library that allows you to bundle multiple MCP servers together into a single composite server. This MCPB bundle provides a ready-to-use wrapper that demonstrates bundling Mercury Spec Ops and other servers.

Perfect for:
- Consolidating multiple MCP tools into one endpoint
- Simplifying MCP client configuration
- Creating custom composite servers
- Managing multiple sub-server environments

## Features

### Core Capabilities
- **Multi-Server Aggregation**: Combine any number of MCP servers
- **Unified Configuration**: Single configuration point for all sub-servers
- **Environment Variable Management**: Use `RequiredEnv` to enforce required configurations
- **Multiple Transport Modes**: stdio, SSE (Server-Sent Events), InMemory
- **Easy Customization**: Modify which servers are included via simple code changes

### Default Configuration

This bundle comes pre-configured with:
- **Mercury Spec Ops**: Prompt engineering and code analysis tools (no env vars required)

You can easily add more servers by editing `server/index.js`.

## Installation

### Prerequisites
- Node.js >= 18.0.0
- npm

### Install Dependencies

Navigate to the bundle's server directory and install:

```bash
cd bundles/mcp-bundler/server
npm install
```

This will install `@wrtnlabs/mcp-bundler` and its dependencies.

## Configuration

### Environment Variables

**Default Configuration:**
- **No environment variables required** for Mercury Spec Ops (included by default)

**Optional Sub-Servers:**
If you uncomment and include additional sub-servers in `server/index.js`, they may require:
- `CONTEXT_FILE`: For MCP Docs Server (path to context.md)
- `API_KEY`: For API-based servers
- Custom variables: Depends on which servers you add

### Customizing Sub-Servers

Edit `server/index.js` to customize which MCP servers are bundled:

```javascript
export const server = bundler({
  name: "My Custom Bundle",
  version: "1.0.0",
  mcpServers: {
    "mercury-spec-ops": {
      command: "npx",
      args: ["-y", "@n0zer0d4y/mercury-spec-ops@latest"],
      env: {},
    },
    
    // Add more servers here
    "my-custom-server": {
      command: "npx",
      args: ["-y", "my-mcp-server"],
      env: {
        API_KEY: RequiredEnv, // Marks as required
        BASE_URL: "https://api.example.com", // Optional default
      },
    },
  },
});
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-bundler": {
      "command": "node",
      "args": ["/path/to/bundles/mcp-bundler/server/index.js"],
      "env": {
        "CONTEXT_FILE": "/path/to/context.md"
      }
    }
  }
}
```

### Cursor Configuration

Add to your MCP settings:

```json
{
  "mcp-bundler": {
    "command": "node",
    "args": ["/path/to/bundles/mcp-bundler/server/index.js"],
    "env": {
      "CONTEXT_FILE": "/path/to/context.md"
    }
  }
}
```

## Usage

### Running in Different Modes

#### stdio Mode (Default)
```bash
node server/index.js
```

#### SSE Mode (Server-Sent Events)
```bash
node server/index.js -p 4506
```

Then connect via HTTP at `http://localhost:4506`

### Adding Sub-Servers

To add a new MCP server to your bundle:

1. **Edit `server/index.js`**
2. **Add server configuration** to the `mcpServers` object
3. **Specify environment variables** using `RequiredEnv` for required vars
4. **Restart the bundler**

Example adding a fictional API server:

```javascript
"weather-api": {
  command: "npx",
  args: ["-y", "weather-mcp-server"],
  env: {
    WEATHER_API_KEY: RequiredEnv,
    UNITS: "metric",
  },
},
```

### Removing Sub-Servers

Simply comment out or delete the server entry from the `mcpServers` object in `server/index.js`.

## Environment Variable Management

### Using RequiredEnv

The `RequiredEnv` marker tells the bundler that an environment variable **must** be provided:

```javascript
env: {
  API_KEY: RequiredEnv, // Client MUST provide this
}
```

If the client doesn't provide the variable, the bundler will error on startup.

### Optional Variables with Defaults

Provide a default value for optional environment variables:

```javascript
env: {
  LOG_LEVEL: "info", // Optional, defaults to "info"
  API_URL: "https://api.default.com", // Optional with default
}
```

### Passing Through Variables

Set environment variables when running the bundler:

```bash
CONTEXT_FILE=/path/to/context.md node server/index.js
```

Or in your MCP client configuration:

```json
{
  "command": "node",
  "args": ["server/index.js"],
  "env": {
    "CONTEXT_FILE": "/path/to/context.md",
    "LOG_LEVEL": "debug"
  }
}
```

## Troubleshooting

### Module not found: @wrtnlabs/mcp-bundler
**Solution**: Run `npm install` in the `server/` directory

### Sub-server fails to start
**Solution**: 
- Check that the sub-server's command is correct
- Ensure all required environment variables are provided
- Verify sub-server dependencies are installed (e.g., Python for docs server)

### RequiredEnv error
**Error**: `Environment variable X is required but not provided`

**Solution**: Add the required environment variable to your MCP client configuration or export it before running the bundler.

### Port already in use (SSE mode)
**Solution**: Use a different port: `node server/index.js -p 4507`

## File Structure

```
mcp-bundler/
├── manifest.json              # MCPB manifest configuration
├── README.md                 # This file
└── server/
    ├── index.js              # Bundler wrapper server
    └── package.json          # Node.js dependencies
```

## Advanced Usage

### Creating Custom Bundler Configurations

You can create multiple bundler configurations for different scenarios:

```javascript
// server/production.js
export const server = bundler({
  name: "Production Bundle",
  mcpServers: {
    // Production servers only
  },
});

// server/development.js
export const server = bundler({
  name: "Development Bundle",
  mcpServers: {
    // Dev + test servers
  },
});
```

### InMemory Transport

For programmatic usage within Node.js applications:

```javascript
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { server } from "./server/index.js";

const client = new Client({ name: "test", version: "1.0.0" });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

await Promise.all([
  client.connect(clientTransport),
  server.connect(serverTransport),
]);
```

## Compatibility

- **Platforms**: macOS, Windows, Linux
- **Node.js**: >= 18.0.0
- **License**: MIT

## Links

- **MCP Bundler Repository**: https://github.com/wrtnlabs/mcp-bundler
- **NPM Package**: https://www.npmjs.com/package/@wrtnlabs/mcp-bundler
- **MCP Protocol**: https://modelcontextprotocol.io
- **Issues**: https://github.com/wrtnlabs/mcp-bundler/issues

## Support

For issues or questions:
- Check the troubleshooting section above
- Visit the [wrtnlabs/mcp-bundler repository](https://github.com/wrtnlabs/mcp-bundler/issues)
- Review sub-server documentation for specific server issues
- Ensure Node.js version is >= 18.0.0

