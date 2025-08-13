# MCPhub Cloudflare Worker

This Cloudflare Worker enables the deployment of MCPhub to Cloudflare, making it accessible through custom domains.

## Features

- Proxies requests to the MCPhub backend server
- Handles SSE connections properly
- Adds CORS headers to responses
- Serves the frontend static assets
- Provides API key endpoint

## Configuration

The worker is configured using environment variables:

- `MCPHUB_BACKEND_URL`: The URL of the MCPhub backend server (default: `http://pixeliumperfecto.co.uk:3001`)
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins for CORS (default: `*`)
- `MCPHUB_API_KEY`: API key for authentication (default: `API SET IN MCPhub`)

## Deployment

To deploy the worker to Cloudflare:

1. Set the Cloudflare API token and account ID:

```bash
export CLOUDFLARE_API_TOKEN=eae82cf159577a8838cc83612104c09c5a0d6
export CLOUDFLARE_ACCOUNT_ID=2b2a1d3effa7f7fe4fe2a8c4e48681e3
```

2. Run the deployment script:

```bash
./deploy.sh
```

## Local Development

To run the worker locally:

```bash
npm run dev
```

## URLs

- Worker URL: https://mcp.pixelium.workers.dev
- Frontend URL: https://www.pixelium.co.uk
- API URL: https://api.pixelium.co.uk
- SSE Endpoint: https://api.pixelium.co.uk/sse

## Endpoints

- `/health`: Health check endpoint
- `/api/key`: API key endpoint
- `/sse`: SSE endpoint (proxied to backend)
- `/api/*`: API endpoints (proxied to backend)
- `/*`: Frontend static assets (proxied to backend)

