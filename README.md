# MCPhub with Cloudflare Deployment

This repository contains the MCPhub server with Cloudflare Workers deployment support.

## Architecture

The architecture consists of two main components:

1. **MCPhub Backend Server**: Runs on port 3001 and provides the core MCPhub functionality.
2. **Cloudflare Worker**: Acts as a proxy to expose the MCPhub backend to the internet securely.

## Deployment

### Backend Server

The backend server runs on port 3001 and can be started with:

```bash
PORT=3001 npm run backend:dev
```

### Cloudflare Worker

The Cloudflare Worker is deployed using the Cloudflare API. The deployment script is located at `scripts/deploy-cloudflare-worker.sh`.

To deploy the worker:

```bash
CLOUDFLARE_API_KEY="your-api-key" \
CLOUDFLARE_ACCOUNT_ID="your-account-id" \
MCPHUB_BACKEND_URL="http://your-backend-url:3001" \
CUSTOM_DOMAIN="mcp.pixelium.co.uk" \
EMAIL="your-email@example.com" \
./scripts/deploy-cloudflare-worker.sh
```

## Client Configuration

After deploying the Cloudflare Worker, a client configuration file is generated at `mcphub-worker-config.json`. This file can be used to configure MCP clients to connect to the MCPhub server through the Cloudflare Worker.

```json
{
  "mcpServers": {
    "MCPhub": {
      "type": "sse",
      "url": "http://mcp.pixelium.co.uk/sse",
      "keepAliveInterval": 60000,
      "owner": "admin",
      "MCPhub_API": "API SET IN MCPhub"
    }
  }
}
```

## Endpoints

- **Backend Health Check**: `http://localhost:3001/health`
- **Cloudflare Worker Health Check**: `http://mcp.pixelium.co.uk/health`
- **SSE Endpoint**: `http://mcp.pixelium.co.uk/sse`

## Development

### Local Development

For local development, you can run the backend server directly:

```bash
PORT=3001 npm run backend:dev
```

### Testing

To test the Cloudflare Worker locally, you can use Wrangler:

```bash
cd cloudflare-worker
npm install
npx wrangler dev
```

## Troubleshooting

If you encounter issues with the Cloudflare Worker deployment, check the following:

1. Ensure the API key and account ID are correct.
2. Verify that the backend server is running and accessible.
3. Check the Cloudflare Worker logs for any errors.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

