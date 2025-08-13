#!/bin/bash

# Test script for MCPhub Cloudflare Worker with error handling

echo "Testing MCPhub Cloudflare Worker..."
echo "=================================="

# Function to test a URL with error handling
test_url() {
    local url=$1
    local description=$2
    local headers_only=${3:-false}
    local timeout=${4:-10}
    
    echo "Testing $description: $url"
    
    if [ "$headers_only" = true ]; then
        response=$(curl -s -I -m $timeout -w "%{http_code}" -o /dev/null "$url" 2>&1)
        exit_code=$?
    else
        response=$(curl -s -m $timeout -w "%{http_code}" -o /dev/null "$url" 2>&1)
        exit_code=$?
    fi
    
    if [ $exit_code -eq 0 ]; then
        if [[ $response =~ ^[23][0-9][0-9]$ ]]; then
            echo "✅ Success! Status code: $response"
            return 0
        else
            echo "❌ Failed! Status code: $response"
            return 1
        fi
    else
        echo "❌ Connection error: $response"
        return 1
    fi
}

# Test Cloudflare Worker URL
test_url "https://mcp.pixelium.workers.dev/health" "Cloudflare Worker health endpoint"

# Test frontend URL
test_url "https://www.pixelium.co.uk" "Frontend URL" true

# Test API URL
test_url "https://api.pixelium.co.uk/health" "API health endpoint"

# Test SSE endpoint
test_url "https://api.pixelium.co.uk/sse" "SSE endpoint"

# Test backend server directly
test_url "http://pixeliumperfecto.co.uk:3001/health" "Backend server health endpoint"

echo ""
echo "Tests completed!"
echo "=================================="
echo "Note: If tests failed, please check the following:"
echo "1. Ensure the Cloudflare Worker is deployed"
echo "2. Verify DNS settings for custom domains"
echo "3. Check that the backend server is running"
echo "4. Confirm Cloudflare API token and account ID are correct"

