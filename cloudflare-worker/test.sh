#!/bin/bash

# Test script for MCPhub Cloudflare Worker

echo "Testing MCPhub Cloudflare Worker..."

# Test frontend URL
echo "Testing frontend URL: https://www.pixelium.co.uk"
curl -s -I https://www.pixelium.co.uk
echo ""

# Test API URL
echo "Testing API URL: https://api.pixelium.co.uk/health"
curl -s https://api.pixelium.co.uk/health
echo ""

# Test SSE endpoint
echo "Testing SSE endpoint: https://api.pixelium.co.uk/sse"
curl -s -N https://api.pixelium.co.uk/sse -H "Accept: text/event-stream" --max-time 5
echo ""

echo "Tests completed!"

