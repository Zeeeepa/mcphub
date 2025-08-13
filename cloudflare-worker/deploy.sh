#!/bin/bash

# Cloudflare Worker deployment script

# Default values
CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:-""}
CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:-""}
MCPHUB_BACKEND_URL=${MCPHUB_BACKEND_URL:-"http://localhost:3001"}
MCPHUB_API_KEY=${MCPHUB_API_KEY:-"API_KEY_PLACEHOLDER"}
ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-"*"}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --api-token=*)
      CLOUDFLARE_API_TOKEN="${1#*=}"
      shift
      ;;
    --account-id=*)
      CLOUDFLARE_ACCOUNT_ID="${1#*=}"
      shift
      ;;
    --backend-url=*)
      MCPHUB_BACKEND_URL="${1#*=}"
      shift
      ;;
    --api-key=*)
      MCPHUB_API_KEY="${1#*=}"
      shift
      ;;
    --allowed-origins=*)
      ALLOWED_ORIGINS="${1#*=}"
      shift
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --api-token=TOKEN       Cloudflare API token"
      echo "  --account-id=ID         Cloudflare account ID"
      echo "  --backend-url=URL       MCPhub backend URL (default: http://localhost:3001)"
      echo "  --api-key=KEY           MCPhub API key"
      echo "  --allowed-origins=ORIGINS Allowed origins for CORS (default: *)"
      echo "  --help                  Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Check required parameters
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "Error: Cloudflare API token is required"
  echo "Use --api-token=TOKEN or set CLOUDFLARE_API_TOKEN environment variable"
  exit 1
fi

if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "Error: Cloudflare account ID is required"
  echo "Use --account-id=ID or set CLOUDFLARE_ACCOUNT_ID environment variable"
  exit 1
fi

# Set environment variables for wrangler
export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID

# Install wrangler if not already installed
if ! command -v wrangler &> /dev/null; then
  echo "Installing wrangler..."
  npm install -g wrangler
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Deploy SSE worker
echo "Deploying SSE worker..."
wrangler deploy --env sse --var MCPHUB_BACKEND_URL:$MCPHUB_BACKEND_URL --var MCPHUB_API_KEY:$MCPHUB_API_KEY --var ALLOWED_ORIGINS:$ALLOWED_ORIGINS

# Deploy Frontend worker
echo "Deploying Frontend worker..."
wrangler deploy --env frontend --var MCPHUB_BACKEND_URL:$MCPHUB_BACKEND_URL --var MCPHUB_API_KEY:$MCPHUB_API_KEY --var ALLOWED_ORIGINS:$ALLOWED_ORIGINS

# Deploy Backend worker
echo "Deploying Backend worker..."
wrangler deploy --env backend --var MCPHUB_BACKEND_URL:$MCPHUB_BACKEND_URL --var MCPHUB_API_KEY:$MCPHUB_API_KEY --var ALLOWED_ORIGINS:$ALLOWED_ORIGINS

echo "Deployment complete!"
echo "Worker URLs:"
echo "  SSE: https://sse.pixelium.workers.dev"
echo "  Frontend: https://frontend.pixelium.workers.dev"
echo "  Backend: https://backend.pixelium.workers.dev"

# Generate client configuration
echo "Generating client configuration..."
cat > ../mcphub-worker-config.json << EOF
{
  "mcpServers": {
    "MCPhub": {
      "type": "sse",
      "url": "https://sse.pixelium.workers.dev",
      "keepAliveInterval": 60000,
      "owner": "admin",
      "MCPhub_API": "$MCPHUB_API_KEY"
    }
  }
}
EOF

echo "Client configuration generated: mcphub-worker-config.json"

