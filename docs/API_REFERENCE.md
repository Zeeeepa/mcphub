# MCPhub API Reference

This document provides comprehensive API reference for MCPhub with database backend and enhanced authentication.

## 🔐 Authentication

MCPhub supports multiple authentication methods:

### 1. API Key Authentication (Recommended)

```bash
# Header-based
curl -H "Authorization: Bearer YOUR_API_KEY" https://your-domain.com/api/health

# Query parameter
curl "https://your-domain.com/api/health?api_key=YOUR_API_KEY"

# Custom header
curl -H "X-API-Key: YOUR_API_KEY" https://your-domain.com/api/health
```

### 2. JWT Token Authentication

```bash
# Login to get JWT token
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your_password"}'

# Use JWT token
curl -H "x-auth-token: YOUR_JWT_TOKEN" https://your-domain.com/api/servers
```

### 3. Legacy Bearer Token

```bash
# System-wide bearer token (configured in settings)
curl -H "Authorization: Bearer SYSTEM_BEARER_TOKEN" https://your-domain.com/api/health
```

## 📊 Core API Endpoints

### Health Check

```http
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "database": "connected",
  "version": "1.0.0",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### System Information

```http
GET /api/info
```

**Response:**
```json
{
  "name": "MCPhub",
  "version": "1.0.0",
  "environment": "production",
  "features": {
    "database": true,
    "smartRouting": false,
    "cloudflare": true
  },
  "stats": {
    "totalServers": 5,
    "activeConnections": 12,
    "totalUsers": 3
  }
}
```

## 🔧 Configuration Management

### Get Configuration

```http
GET /api/config
Authorization: Bearer YOUR_API_KEY
```

**Response:**
```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "enabled": true,
      "owner": "admin"
    }
  },
  "systemConfig": {
    "routing": {
      "enableGlobalRoute": true,
      "enableGroupNameRoute": true,
      "enableBearerAuth": true,
      "skipAuth": false
    }
  },
  "groups": [
    {
      "id": "uuid",
      "name": "default",
      "description": "Default group",
      "servers": ["fetch", "playwright"]
    }
  ]
}
```

### Update Configuration

```http
PUT /api/config
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
```json
{
  "mcpServers": {
    "new_server": {
      "command": "python",
      "args": ["server.py"],
      "enabled": true,
      "owner": "admin"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Configuration updated successfully",
  "changes": {
    "added": ["new_server"],
    "modified": [],
    "removed": []
  }
}
```

## 🖥️ Server Management

### List Servers

```http
GET /api/servers
Authorization: Bearer YOUR_API_KEY
```

**Query Parameters:**
- `enabled` (boolean): Filter by enabled status
- `owner` (string): Filter by owner
- `type` (string): Filter by server type

**Response:**
```json
{
  "servers": [
    {
      "id": "uuid",
      "name": "fetch",
      "displayName": "Web Fetch Server",
      "description": "Fetch content from web URLs",
      "type": "stdio",
      "enabled": true,
      "owner": "admin",
      "config": {
        "command": "uvx",
        "args": ["mcp-server-fetch"]
      },
      "createdAt": "2024-01-01T12:00:00Z",
      "updatedAt": "2024-01-01T12:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10
}
```

### Get Server Details

```http
GET /api/servers/{serverId}
Authorization: Bearer YOUR_API_KEY
```

**Response:**
```json
{
  "id": "uuid",
  "name": "fetch",
  "displayName": "Web Fetch Server",
  "description": "Fetch content from web URLs",
  "type": "stdio",
  "enabled": true,
  "owner": "admin",
  "config": {
    "command": "uvx",
    "args": ["mcp-server-fetch"],
    "env": {}
  },
  "tools": [
    {
      "name": "fetch_url",
      "description": "Fetch content from a URL",
      "inputSchema": {
        "type": "object",
        "properties": {
          "url": {"type": "string"}
        }
      }
    }
  ],
  "stats": {
    "totalConnections": 45,
    "totalToolCalls": 123,
    "lastUsed": "2024-01-01T11:30:00Z"
  }
}
```

### Create Server

```http
POST /api/servers
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "custom_server",
  "displayName": "My Custom Server",
  "description": "Custom MCP server",
  "type": "stdio",
  "config": {
    "command": "python",
    "args": ["my_server.py"],
    "env": {
      "API_KEY": "secret"
    }
  },
  "enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Server created successfully",
  "server": {
    "id": "uuid",
    "name": "custom_server",
    "displayName": "My Custom Server",
    "enabled": true,
    "createdAt": "2024-01-01T12:00:00Z"
  }
}
```

### Update Server

```http
PUT /api/servers/{serverId}
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
```json
{
  "displayName": "Updated Server Name",
  "enabled": false,
  "config": {
    "command": "python",
    "args": ["updated_server.py"]
  }
}
```

### Delete Server

```http
DELETE /api/servers/{serverId}
Authorization: Bearer YOUR_API_KEY
```

**Response:**
```json
{
  "success": true,
  "message": "Server deleted successfully"
}
```

## 👥 User Management

### List Users (Admin Only)

```http
GET /api/users
Authorization: Bearer ADMIN_API_KEY
```

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "username": "admin",
      "email": "admin@example.com",
      "isAdmin": true,
      "createdAt": "2024-01-01T12:00:00Z",
      "lastLogin": "2024-01-01T11:30:00Z"
    }
  ],
  "total": 1
}
```

### Create User (Admin Only)

```http
POST /api/users
Authorization: Bearer ADMIN_API_KEY
Content-Type: application/json
```

**Request Body:**
```json
{
  "username": "newuser",
  "password": "secure_password",
  "email": "user@example.com",
  "isAdmin": false
}
```

### Update User

```http
PUT /api/users/{userId}
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "newemail@example.com",
  "password": "new_password"
}
```

## 🔑 API Key Management

### List API Keys

```http
GET /api/auth/keys
Authorization: Bearer YOUR_API_KEY
```

**Response:**
```json
{
  "keys": [
    {
      "id": "uuid",
      "name": "Production Key",
      "isActive": true,
      "permissions": {
        "servers": ["*"],
        "admin": false
      },
      "createdAt": "2024-01-01T12:00:00Z",
      "lastUsed": "2024-01-01T11:30:00Z",
      "expiresAt": null
    }
  ]
}
```

### Create API Key

```http
POST /api/auth/keys
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "New API Key",
  "permissions": {
    "servers": ["fetch", "playwright"],
    "groups": ["default"],
    "admin": false
  },
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

**Response:**
```json
{
  "success": true,
  "message": "API key created successfully",
  "apiKey": "generated_api_key_here",
  "keyInfo": {
    "id": "uuid",
    "name": "New API Key",
    "createdAt": "2024-01-01T12:00:00Z"
  }
}
```

### Revoke API Key

```http
DELETE /api/auth/keys/{keyId}
Authorization: Bearer YOUR_API_KEY
```

## 📊 Analytics and Logging

### Connection Logs

```http
GET /api/logs/connections
Authorization: Bearer YOUR_API_KEY
```

**Query Parameters:**
- `serverId` (string): Filter by server
- `userId` (string): Filter by user
- `status` (string): Filter by connection status
- `from` (ISO date): Start date
- `to` (ISO date): End date
- `limit` (number): Results per page
- `page` (number): Page number

**Response:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "serverId": "uuid",
      "serverName": "fetch",
      "userId": "uuid",
      "username": "admin",
      "status": "connected",
      "sessionId": "session_123",
      "connectedAt": "2024-01-01T12:00:00Z",
      "disconnectedAt": "2024-01-01T12:30:00Z",
      "durationSeconds": 1800
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 10
}
```

### Tool Usage Logs

```http
GET /api/logs/tools
Authorization: Bearer YOUR_API_KEY
```

**Response:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "serverId": "uuid",
      "serverName": "fetch",
      "toolName": "fetch_url",
      "userId": "uuid",
      "username": "admin",
      "status": "success",
      "executionTimeMs": 1500,
      "createdAt": "2024-01-01T12:00:00Z"
    }
  ],
  "total": 500,
  "page": 1,
  "limit": 10
}
```

### Usage Statistics

```http
GET /api/stats
Authorization: Bearer YOUR_API_KEY
```

**Query Parameters:**
- `period` (string): `hour`, `day`, `week`, `month`
- `from` (ISO date): Start date
- `to` (ISO date): End date

**Response:**
```json
{
  "period": "day",
  "from": "2024-01-01T00:00:00Z",
  "to": "2024-01-01T23:59:59Z",
  "stats": {
    "totalConnections": 150,
    "totalToolCalls": 1200,
    "uniqueUsers": 5,
    "averageSessionDuration": 1800,
    "topServers": [
      {
        "name": "fetch",
        "connections": 80,
        "toolCalls": 600
      }
    ],
    "topTools": [
      {
        "name": "fetch_url",
        "calls": 400,
        "averageExecutionTime": 1200
      }
    ]
  }
}
```

## 🔄 MCP Protocol Endpoints

### Server-Sent Events (SSE)

```http
GET /sse
Authorization: Bearer YOUR_API_KEY
Accept: text/event-stream
```

**Headers:**
- `Authorization`: Bearer token with API key
- `Accept`: `text/event-stream`
- `Cache-Control`: `no-cache`

### Group-Specific SSE

```http
GET /sse/{groupName}
Authorization: Bearer YOUR_API_KEY
Accept: text/event-stream
```

### Smart Routing SSE

```http
GET /sse/$smart
Authorization: Bearer YOUR_API_KEY
Accept: text/event-stream
```

### Tool Execution

```http
POST /tools/call/{serverName}/{toolName}
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
```json
{
  "arguments": {
    "url": "https://example.com",
    "method": "GET"
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "content": "HTML content here",
    "status": 200,
    "headers": {}
  },
  "executionTime": 1500,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## 🔧 System Configuration

### Get System Config

```http
GET /api/system/config
Authorization: Bearer ADMIN_API_KEY
```

### Update System Config

```http
PUT /api/system/config
Authorization: Bearer ADMIN_API_KEY
Content-Type: application/json
```

**Request Body:**
```json
{
  "routing": {
    "enableGlobalRoute": true,
    "enableGroupNameRoute": true,
    "enableBearerAuth": true,
    "skipAuth": false
  },
  "cloudflare": {
    "tunnelEnabled": true,
    "domain": "your-domain.com"
  }
}
```

## 📝 Client Configuration Generation

### Generate Client Config

```http
POST /api/client/config
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
```json
{
  "deployment": "cloudflare",
  "domain": "your-domain.com",
  "serverName": "MCPhub",
  "includeAllServers": false,
  "format": "json"
}
```

**Response:**
```json
{
  "config": {
    "mcpServers": {
      "MCPhub": {
        "type": "sse",
        "url": "https://your-domain.com/sse",
        "keepAliveInterval": 60000,
        "owner": "admin",
        "env": "YOUR_API_KEY"
      }
    }
  },
  "format": "json",
  "generatedAt": "2024-01-01T12:00:00Z"
}
```

## ❌ Error Responses

### Standard Error Format

```json
{
  "success": false,
  "error": {
    "code": "INVALID_API_KEY",
    "message": "The provided API key is invalid or expired",
    "details": {
      "hint": "Check your API key in the MCPhub dashboard"
    }
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `INVALID_API_KEY` | 401 | API key is invalid or expired |
| `INSUFFICIENT_PERMISSIONS` | 403 | User lacks required permissions |
| `SERVER_NOT_FOUND` | 404 | Requested server does not exist |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `SERVER_UNAVAILABLE` | 503 | MCP server is not available |

## 🔄 Rate Limiting

API endpoints are rate limited based on API key:

- **Standard Keys**: 100 requests/minute
- **Admin Keys**: 1000 requests/minute
- **System Keys**: Unlimited

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## 📚 SDK and Examples

### JavaScript/Node.js

```javascript
const MCPhubClient = require('mcphub-client');

const client = new MCPhubClient({
  baseUrl: 'https://your-domain.com',
  apiKey: 'your-api-key'
});

// List servers
const servers = await client.servers.list();

// Create server
const newServer = await client.servers.create({
  name: 'my-server',
  config: { command: 'python', args: ['server.py'] }
});

// Execute tool
const result = await client.tools.execute('fetch', 'fetch_url', {
  url: 'https://example.com'
});
```

### Python

```python
import mcphub

client = mcphub.Client(
    base_url='https://your-domain.com',
    api_key='your-api-key'
)

# List servers
servers = client.servers.list()

# Create server
new_server = client.servers.create(
    name='my-server',
    config={'command': 'python', 'args': ['server.py']}
)

# Execute tool
result = client.tools.execute('fetch', 'fetch_url', {
    'url': 'https://example.com'
})
```

### cURL Examples

```bash
# List servers
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://your-domain.com/api/servers

# Create server
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","config":{"command":"echo"}}' \
  https://your-domain.com/api/servers

# Execute tool
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"arguments":{"url":"https://example.com"}}' \
  https://your-domain.com/tools/call/fetch/fetch_url
```

## 🔍 Debugging and Monitoring

### Debug Headers

Add debug headers to get additional information:

```http
X-Debug: true
X-Trace-Id: your-trace-id
```

### Health Check Endpoints

```http
GET /health              # Basic health check
GET /health/detailed     # Detailed health information
GET /health/database     # Database connectivity
GET /health/servers      # MCP server status
```

## 📖 Additional Resources

- [MCPhub GitHub Repository](https://github.com/samanhappy/mcphub)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [WebSocket API Documentation](./WEBSOCKET_API.md)
- [Authentication Guide](./AUTHENTICATION.md)

