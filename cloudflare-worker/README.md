# MCPhub Cloudflare Worker

This Cloudflare Worker proxies requests to the MCPhub SSE endpoint, handling CORS, authentication, and connection management for Server-Sent Events.

## Features

- Proxies SSE connections to MCPhub
- Handles CORS headers
- Supports API key authentication
- Provides health endpoint
- Forwards all other requests to backend

## Deployment

### Prerequisites

- Cloudflare account
- Wrangler CLI installed (`npm install -g wrangler`)
- MCPhub running on a server or locally

### Manual Deployment

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure wrangler.toml:
   ```toml
   name = "mcp"
   main = "src/index.js"
   compatibility_date = "2024-01-01"
   compatibility_flags = ["nodejs_compat"]

   account_id = "2b2a1d3effa7f7fe4fe2a8c4e48681e3"

   [env.production]
   name = "mcp"
   workers_dev = true

   # Environment variables for the worker
   [vars]
   MCPHUB_BACKEND_URL = "http://localhost:3001"
   ALLOWED_ORIGINS = "*"
   ```

3. Deploy the worker:
   ```bash
   npm run deploy
   ```

### Automated Deployment

Use the provided deployment script:

```bash
../../scripts/deploy-cloudflare-worker.sh
```

## Configuration

The worker can be configured using environment variables in wrangler.toml:

- `MCPHUB_BACKEND_URL`: URL of the MCPhub backend server
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins for CORS
- `MCPHUB_API_KEY`: API key for authentication (optional)
- `DEBUG`: Enable debug logging (true/false)

## Usage

After deployment, the worker will be available at:

```
https://mcp.pixeliumperfecto.workers.dev
```

### Endpoints

- `/health`: Health check endpoint
- `/sse`: SSE endpoint for MCPhub
- All other paths are forwarded to the backend

### Client Configuration

```json
{
  "mcpServers": {
    "MCPhub": {
      "type": "sse",
      "url": "https://mcp.pixeliumperfecto.workers.dev/sse",
      "keepAliveInterval": 60000,
      "owner": "admin"
    }
  }
}
```

