#!/bin/bash

#########################################
# Cloudflare Worker Deployment Script for MCPhub
# Deploys a Cloudflare Worker to proxy MCP requests
#########################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration from environment variables
CLOUDFLARE_API_KEY=${CLOUDFLARE_API_KEY:-"eae82cf159577a8838cc83612104c09c5a0d6"}
CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:-"2b2a1d3effa7f7fe4fe2a8c4e48681e3"}
CLOUDFLARE_WORKER_NAME=${CLOUDFLARE_WORKER_NAME:-"mcp"}
CLOUDFLARE_WORKER_URL=${CLOUDFLARE_WORKER_URL:-"https://mcp.pixeliumperfecto.workers.dev"}
MCPHUB_BACKEND_URL=${MCPHUB_BACKEND_URL:-"http://localhost:3001"}
EMAIL=${EMAIL:-"pixeliumperfecto@gmail.com"}

# Paths
WORKER_DIR="cloudflare-worker"
LOG_FILE="/tmp/cloudflare-worker-deploy.log"

# Function to log messages
log_message() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO:${NC} $1" | tee -a "$LOG_FILE"
}

# Create log file
touch "$LOG_FILE"
log_message "Starting Cloudflare Worker deployment for MCPhub"

# Install wrangler CLI if not present
if ! command -v wrangler &> /dev/null; then
    log_message "Installing Wrangler CLI..."
    npm install -g wrangler
    log_message "Wrangler CLI installed successfully"
else
    log_info "Wrangler CLI already installed: $(wrangler --version)"
fi

# Setup wrangler authentication
log_message "Setting up Wrangler authentication..."
export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_KEY"
export CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"

# Update wrangler.toml with current configuration
log_message "Updating wrangler configuration..."
cd "$WORKER_DIR"

# Update wrangler.toml with current values
cat > wrangler.toml <<EOF
name = "$CLOUDFLARE_WORKER_NAME"
main = "src/index.js"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

account_id = "$CLOUDFLARE_ACCOUNT_ID"

[env.production]
name = "$CLOUDFLARE_WORKER_NAME"
workers_dev = true

# Environment variables for the worker
[vars]
MCPHUB_BACKEND_URL = "$MCPHUB_BACKEND_URL"
ALLOWED_ORIGINS = "*"

# Build configuration
[build]
command = ""
EOF

log_message "Wrangler configuration updated"

# Install worker dependencies
log_message "Installing worker dependencies..."
if [ -f "package.json" ]; then
    npm install
fi

# Deploy the worker
log_message "Deploying Cloudflare Worker..."
wrangler deploy --env production

log_message "Worker deployed successfully to $CLOUDFLARE_WORKER_URL"

# Generate client configuration
log_message "Generating client configuration..."
cd ..

# Create client configuration
cat > mcphub-worker-config.json <<EOF
{
  "mcpServers": {
    "MCPhub": {
      "type": "sse",
      "url": "$CLOUDFLARE_WORKER_URL/sse",
      "keepAliveInterval": 60000,
      "owner": "admin"
    }
  }
}
EOF

log_message "Client configuration generated at mcphub-worker-config.json"

# Final instructions
log_message "Cloudflare Worker deployment complete!"
log_message "Your MCPhub instance is now accessible at $CLOUDFLARE_WORKER_URL/sse"
log_message ""
log_message "Client configuration is available in mcphub-worker-config.json"
log_message "Use this configuration in your MCP client to connect to MCPhub"

