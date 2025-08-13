#!/bin/bash

# Cloudflare Worker deployment script

# Set environment variables
export CLOUDFLARE_API_TOKEN=eae82cf159577a8838cc83612104c09c5a0d6
export CLOUDFLARE_ACCOUNT_ID=2b2a1d3effa7f7fe4fe2a8c4e48681e3

# Install wrangler if not already installed
if ! command -v wrangler &> /dev/null; then
    echo "Installing wrangler..."
    npm install -g wrangler
fi

# Build the worker
echo "Building worker..."
npm run build

# Deploy the worker
echo "Deploying worker to Cloudflare..."
wrangler deploy

echo "Deployment complete!"
echo "Worker URL: https://mcp.pixelium.workers.dev"
echo "Custom domain: https://mcp.pixelium.co.uk"

