# MCPhub Cloudflare Workers

This project contains Cloudflare Workers for deploying MCPhub to Cloudflare, making it accessible through dedicated worker subdomains.

## Architecture

The deployment consists of three specialized workers:

1. **SSE Worker** (sse.pixelium.workers.dev)
   - Handles SSE connections for real-time updates
   - Optimized for streaming event data

2. **Frontend Worker** (frontend.pixelium.workers.dev)
   - Serves the frontend static assets
   - Optimized for HTML, CSS, JS, and other static assets

3. **Backend Worker** (backend.pixelium.workers.dev)
   - Handles API requests
   - Provides API key endpoint
   - Optimized for JSON data

## Configuration

The workers are configured using environment variables:

- `MCPHUB_BACKEND_URL`: The URL of the MCPhub backend server (default: `http://localhost:3001`)
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins for CORS (default: `*`)
- `MCPHUB_API_KEY`: API key for authentication (default: `API_KEY_PLACEHOLDER`)

## Deployment

To deploy the workers to Cloudflare:

1. Set the Cloudflare API token and account ID:

```bash
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
```

2. Run the deployment script:

```bash
./deploy.sh --backend-url="http://your-backend-url:3001" --api-key="your-api-key"
```

Or use command-line arguments:

```bash
./deploy.sh \
  --api-token="your-api-token" \
  --account-id="your-account-id" \
  --backend-url="http://your-backend-url:3001" \
  --api-key="your-api-key" \
  --allowed-origins="*"
```

## Local Development

To run the workers locally:

```bash
# Run SSE worker
npm run dev:sse

# Run Frontend worker
npm run dev:frontend

# Run Backend worker
npm run dev:backend
```

## Testing

To test the deployed workers:

```bash
./test.sh
```

This script will:
1. Test the health endpoints of all workers
2. Verify the SSE connection
3. Check the frontend content
4. Validate the API key endpoint
5. Test the backend server directly

## URLs

- SSE Worker: https://sse.pixelium.workers.dev
- Frontend Worker: https://frontend.pixelium.workers.dev
- Backend Worker: https://backend.pixelium.workers.dev

## Client Configuration

After deployment, a client configuration file is generated at `mcphub-worker-config.json`:

```json
{
  "mcpServers": {
    "MCPhub": {
      "type": "sse",
      "url": "https://sse.pixelium.workers.dev",
      "keepAliveInterval": 60000,
      "owner": "admin",
      "MCPhub_API": "your-api-key"
    }
  }
}
```

Use this configuration file to connect MCP clients to the MCPhub server through the Cloudflare Workers.

