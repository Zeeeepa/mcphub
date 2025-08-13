#!/bin/bash

# Cloudflare Worker Deployment Script
# This script deploys the MCPhub Cloudflare Worker using the Cloudflare API directly

# Configuration
ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:-""}
API_KEY=${CLOUDFLARE_API_KEY:-""}
WORKER_NAME=${CLOUDFLARE_WORKER_NAME:-"mcp"}
BACKEND_URL=${MCPHUB_BACKEND_URL:-"http://pixeliumperfecto.co.uk:3001"}
EMAIL=${EMAIL:-""}
CUSTOM_DOMAIN=${CUSTOM_DOMAIN:-"mcp.pixelium.co.uk"}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Log functions
log() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
  exit 1
}

warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if required environment variables are set
if [ -z "$API_KEY" ]; then
  error "CLOUDFLARE_API_KEY environment variable is required"
fi

if [ -z "$ACCOUNT_ID" ]; then
  error "CLOUDFLARE_ACCOUNT_ID environment variable is required"
fi

if [ -z "$EMAIL" ]; then
  error "EMAIL environment variable is required"
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
WORKER_DIR="$ROOT_DIR/cloudflare-worker"
WORKER_FILE="$WORKER_DIR/src/index.js"

# Check if worker file exists
if [ ! -f "$WORKER_FILE" ]; then
  error "Worker file not found at $WORKER_FILE"
fi

# Create temporary worker file with environment variables
log "Creating temporary worker file with environment variables"
TEMP_WORKER_FILE="$WORKER_DIR/worker-bundle.js"
cp "$WORKER_FILE" "$TEMP_WORKER_FILE"

# Deploy worker
log "Deploying worker to Cloudflare"
RESPONSE=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME" \
  -H "X-Auth-Email: $EMAIL" \
  -H "X-Auth-Key: $API_KEY" \
  -F "metadata={\"body_part\":\"script\",\"bindings\":[{\"name\":\"MCPHUB_BACKEND_URL\",\"type\":\"plain_text\",\"text\":\"$BACKEND_URL\"},{\"name\":\"ALLOWED_ORIGINS\",\"type\":\"plain_text\",\"text\":\"*\"}]}" \
  -F "script=@$TEMP_WORKER_FILE")

# Check if deployment was successful
SUCCESS=$(echo "$RESPONSE" | grep -o '"success":true' || echo "")
if [ -z "$SUCCESS" ]; then
  error "Failed to deploy worker: $RESPONSE"
fi

# Clean up temporary file
rm "$TEMP_WORKER_FILE"

# Generate client configuration
log "Generating client configuration"
CONFIG_FILE="$ROOT_DIR/mcphub-worker-config.json"
cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "MCPhub": {
      "type": "sse",
      "url": "http://$CUSTOM_DOMAIN/sse",
      "keepAliveInterval": 60000,
      "owner": "admin",
      "MCPhub_API": "API SET IN MCPhub"
    }
  }
}
EOF

log "Deployment complete!"
log "Your MCPhub instance is now accessible at http://$CUSTOM_DOMAIN/sse"
log "Client configuration is available at $CONFIG_FILE"

