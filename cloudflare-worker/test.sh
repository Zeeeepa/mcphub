#!/bin/bash

# Test script for MCPhub Cloudflare Workers with content verification

echo "Testing MCPhub Cloudflare Workers..."
echo "=================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Function to test a URL with error handling and content verification
test_url() {
    local url=$1
    local description=$2
    local content_check=$3
    local headers_only=${4:-false}
    local timeout=${5:-10}
    
    echo -e "${YELLOW}Testing $description: $url${NC}"
    
    if [ "$headers_only" = true ]; then
        response_headers=$(curl -s -I -m $timeout "$url" 2>&1)
        exit_code=$?
        
        if [ $exit_code -eq 0 ]; then
            status_code=$(echo "$response_headers" | head -n 1 | cut -d' ' -f2)
            if [[ $status_code =~ ^[23][0-9][0-9]$ ]]; then
                echo -e "${GREEN}✅ Success! Status code: $status_code${NC}"
                return 0
            else
                echo -e "${RED}❌ Failed! Status code: $status_code${NC}"
                return 1
            fi
        else
            echo -e "${RED}❌ Connection error: $exit_code${NC}"
            return 1
        fi
    else
        response_content=$(curl -s -m $timeout "$url" 2>&1)
        exit_code=$?
        
        if [ $exit_code -eq 0 ]; then
            # Check if response contains expected content
            if [ -n "$content_check" ] && ! echo "$response_content" | grep -q "$content_check"; then
                echo -e "${RED}❌ Content verification failed! Expected to find: $content_check${NC}"
                echo "Response content (first 200 chars):"
                echo "$response_content" | head -c 200
                echo "..."
                return 1
            else
                echo -e "${GREEN}✅ Success! Content verification passed.${NC}"
                if [ -n "$content_check" ]; then
                    echo "Found expected content: $content_check"
                fi
                return 0
            fi
        else
            echo -e "${RED}❌ Connection error: $exit_code${NC}"
            return 1
        fi
    fi
}

# Function to test SSE endpoint
test_sse() {
    local url=$1
    local description=$2
    local timeout=${3:-5}
    
    echo -e "${YELLOW}Testing $description: $url${NC}"
    
    # Use curl with a timeout to test SSE endpoint
    response=$(curl -s -N -m $timeout "$url" -H "Accept: text/event-stream" 2>&1)
    exit_code=$?
    
    if [ $exit_code -eq 0 ] || [ $exit_code -eq 28 ]; then
        # Check if response contains event-stream data
        if echo "$response" | grep -q "data:"; then
            echo -e "${GREEN}✅ Success! Received SSE data.${NC}"
            echo "First event data:"
            echo "$response" | grep "data:" | head -n 1
            return 0
        else
            echo -e "${RED}❌ No SSE data received!${NC}"
            echo "Response content (first 200 chars):"
            echo "$response" | head -c 200
            echo "..."
            return 1
        fi
    else
        echo -e "${RED}❌ Connection error: $exit_code${NC}"
        return 1
    fi
}

# Test SSE Worker
echo -e "\n${YELLOW}Testing SSE Worker${NC}"
test_url "https://sse.pixelium.workers.dev/health" "SSE Worker health endpoint" "status.*ok"
test_sse "https://sse.pixelium.workers.dev" "SSE Worker SSE endpoint"

# Test Frontend Worker
echo -e "\n${YELLOW}Testing Frontend Worker${NC}"
test_url "https://frontend.pixelium.workers.dev/health" "Frontend Worker health endpoint" "status.*ok"
test_url "https://frontend.pixelium.workers.dev" "Frontend Worker root endpoint" "<html"

# Test Backend Worker
echo -e "\n${YELLOW}Testing Backend Worker${NC}"
test_url "https://backend.pixelium.workers.dev/health" "Backend Worker health endpoint" "status.*ok"
test_url "https://backend.pixelium.workers.dev/api/key" "Backend Worker API key endpoint" "api_key"

# Test backend server directly
echo -e "\n${YELLOW}Testing Backend Server${NC}"
test_url "$MCPHUB_BACKEND_URL/health" "Backend server health endpoint" "status"

echo ""
echo -e "${GREEN}Tests completed!${NC}"
echo "=================================="
echo "Note: If tests failed, please check the following:"
echo "1. Ensure the Cloudflare Workers are deployed"
echo "2. Verify the backend server is running"
echo "3. Confirm Cloudflare API token and account ID are correct"
echo "4. Check the worker logs in Cloudflare dashboard"

