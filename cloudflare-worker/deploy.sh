#!/bin/bash
# Cloudflare Worker Deployment Script for MCPHub
# This script deploys the Cloudflare Worker to handle routing and request transformation
# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
# Load environment variables
if [ -f .env ]; then
    echo -e "${BLUE}Loading environment variables from .env file...${NC}"
    export $(grep -v '^#' .env | xargs)
else
    echo -e "${YELLOW}No .env file found. Make sure to set the required environment variables manually.${NC}"
fi
# Check for required environment variables
if [ -z "$CLOUDFLARE_EMAIL" ] || [ -z "$CLOUDFLARE_API_KEY" ] || [ -z "$CLOUDFLARE_ACCOUNT_ID" ] || [ -z "$CLOUDFLARE_WORKER_NAME" ]; then
    echo -e "${RED}Error: Required Cloudflare credentials are missing.${NC}"
    echo -e "${YELLOW}Please make sure the following environment variables are set:${NC}"
    echo -e "  - CLOUDFLARE_EMAIL"
    echo -e "  - CLOUDFLARE_API_KEY"
    echo -e "  - CLOUDFLARE_ACCOUNT_ID"
    echo -e "  - CLOUDFLARE_WORKER_NAME"
    exit 1
fi
# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${YELLOW}wrangler not found. Installing...${NC}"
    npm install -g wrangler
fi
echo -e "${GREEN}wrangler is installed.${NC}"
# Update wrangler.toml with account ID and worker name
echo -e "${BLUE}Updating wrangler.toml...${NC}"
sed -i "s/name = \"dashboard\"/name = \"$CLOUDFLARE_WORKER_NAME\"/g" cloudflare-worker/wrangler.toml
sed -i "s/account_id = \"\"/account_id = \"$CLOUDFLARE_ACCOUNT_ID\"/g" cloudflare-worker/wrangler.toml
# If domain is provided, update the route
if [ ! -z "$DOMAIN" ]; then
    echo -e "${BLUE}Setting up route for domain: $DOMAIN...${NC}"
    sed -i "s/route = \"\"/route = \"mcp.$DOMAIN\/*\"/g" cloudflare-worker/wrangler.toml
    
    # Get zone ID for the domain
    ZONE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=$DOMAIN" \
        -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
        -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
        -H "Content-Type: application/json" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
    
    if [ ! -z "$ZONE_ID" ]; then
        echo -e "${GREEN}Found zone ID: $ZONE_ID${NC}"
        sed -i "s/zone_id = \"\"/zone_id = \"$ZONE_ID\"/g" cloudflare-worker/wrangler.toml
    else
        echo -e "${YELLOW}Could not find zone ID for domain: $DOMAIN${NC}"
        echo -e "${YELLOW}Make sure the domain is added to your Cloudflare account.${NC}"
    fi
fi
# Update MCP_HOST in wrangler.toml
# If we're using Cloudflare Tunnel, the MCP_HOST should be the tunnel hostname
if [ ! -z "$CLOUDFLARE_WORKER_URL" ]; then
    WORKER_HOSTNAME=$(echo $CLOUDFLARE_WORKER_URL | sed 's/https:\/\///')
    echo -e "${BLUE}Setting MCP_HOST to: $WORKER_HOSTNAME...${NC}"
    sed -i "s/MCP_HOST = \"localhost:3000\"/MCP_HOST = \"$WORKER_HOSTNAME\"/g" cloudflare-worker/wrangler.toml
elif [ ! -z "$DOMAIN" ]; then
    echo -e "${BLUE}Setting MCP_HOST to: mcp.$DOMAIN...${NC}"
    sed -i "s/MCP_HOST = \"localhost:3000\"/MCP_HOST = \"mcp.$DOMAIN\"/g" cloudflare-worker/wrangler.toml
fi
# Authenticate with Cloudflare
echo -e "${BLUE}Authenticating with Cloudflare...${NC}"
echo "CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_KEY" > .env.wrangler
echo "CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID" >> .env.wrangler
# Deploy the worker
echo -e "${BLUE}Deploying Cloudflare Worker...${NC}"
cd cloudflare-worker
wrangler deploy
# Check if deployment was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Cloudflare Worker deployed successfully!${NC}"
    echo -e "${BLUE}Your worker is now available at:${NC}"
    if [ ! -z "$CLOUDFLARE_WORKER_URL" ]; then
        echo -e "  $CLOUDFLARE_WORKER_URL"
    else
        echo -e "  https://$CLOUDFLARE_WORKER_NAME.$DOMAIN.workers.dev"
    fi
else
    echo -e "${RED}Error: Failed to deploy Cloudflare Worker.${NC}"
    exit 1
fi
# Clean up
rm -f .env.wrangler
cd ..
echo -e "${GREEN}Deployment complete!${NC}"

