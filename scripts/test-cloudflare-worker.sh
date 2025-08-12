#!/bin/bash

#########################################
# Cloudflare Worker Testing Script for MCPhub
# Comprehensive testing of the deployed worker
#########################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CLOUDFLARE_WORKER_NAME=${CLOUDFLARE_WORKER_NAME:-"mcp"}
DOMAIN=${DOMAIN:-"pixeliumperfecto.com"}
WORKER_URL="https://$CLOUDFLARE_WORKER_NAME.$DOMAIN"
API_KEY=${MCPHUB_API_KEY:-""}
TEST_TIMEOUT=30

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TEST_RESULTS=()

# Function to log messages
log_message() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

log_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO:${NC} $1"
}

# Test result tracking
test_passed() {
    local test_name="$1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    TEST_RESULTS+=("✅ $test_name")
    log_message "✅ PASSED: $test_name"
}

test_failed() {
    local test_name="$1"
    local error_msg="$2"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TEST_RESULTS+=("❌ $test_name - $error_msg")
    log_error "❌ FAILED: $test_name - $error_msg"
}

# Test basic connectivity
test_basic_connectivity() {
    log_info "Testing basic connectivity to $WORKER_URL"
    
    if curl -s --max-time $TEST_TIMEOUT "$WORKER_URL" > /dev/null 2>&1; then
        test_passed "Basic Connectivity"
    else
        test_failed "Basic Connectivity" "Worker not reachable"
    fi
}

# Test health endpoint
test_health_endpoint() {
    log_info "Testing health endpoint"
    
    local response
    local status_code
    
    response=$(curl -s --max-time $TEST_TIMEOUT -w "%{http_code}" "$WORKER_URL/health" 2>/dev/null)
    status_code="${response: -3}"
    response="${response%???}"
    
    if [ "$status_code" = "200" ]; then
        # Try to parse JSON response
        if echo "$response" | jq . > /dev/null 2>&1; then
            local worker_status
            worker_status=$(echo "$response" | jq -r '.worker.status // "unknown"' 2>/dev/null)
            
            if [ "$worker_status" = "healthy" ]; then
                test_passed "Health Endpoint"
                log_info "Worker status: $worker_status"
            else
                test_failed "Health Endpoint" "Worker status: $worker_status"
            fi
        else
            test_failed "Health Endpoint" "Invalid JSON response"
        fi
    else
        test_failed "Health Endpoint" "HTTP $status_code"
    fi
}

# Test CORS headers
test_cors_headers() {
    log_info "Testing CORS headers"
    
    local response
    response=$(curl -s --max-time $TEST_TIMEOUT -I -X OPTIONS "$WORKER_URL/api/health" \
        -H "Origin: https://$DOMAIN" \
        -H "Access-Control-Request-Method: GET" \
        -H "Access-Control-Request-Headers: Authorization" 2>/dev/null)
    
    if echo "$response" | grep -qi "access-control-allow-origin"; then
        if echo "$response" | grep -qi "access-control-allow-methods"; then
            test_passed "CORS Headers"
        else
            test_failed "CORS Headers" "Missing Access-Control-Allow-Methods"
        fi
    else
        test_failed "CORS Headers" "Missing Access-Control-Allow-Origin"
    fi
}

# Test API endpoint without authentication
test_api_endpoint_no_auth() {
    log_info "Testing API endpoint without authentication"
    
    local response
    local status_code
    
    response=$(curl -s --max-time $TEST_TIMEOUT -w "%{http_code}" "$WORKER_URL/api/health" 2>/dev/null)
    status_code="${response: -3}"
    
    # Should either return 200 (if auth is disabled) or 401 (if auth is required)
    if [ "$status_code" = "200" ] || [ "$status_code" = "401" ]; then
        test_passed "API Endpoint (No Auth)"
        log_info "API endpoint responded with HTTP $status_code"
    else
        test_failed "API Endpoint (No Auth)" "HTTP $status_code"
    fi
}

# Test API endpoint with authentication
test_api_endpoint_with_auth() {
    if [ -z "$API_KEY" ]; then
        log_warning "Skipping API authentication test (no API key provided)"
        return 0
    fi
    
    log_info "Testing API endpoint with authentication"
    
    local response
    local status_code
    
    response=$(curl -s --max-time $TEST_TIMEOUT -w "%{http_code}" \
        -H "Authorization: Bearer $API_KEY" \
        "$WORKER_URL/api/health" 2>/dev/null)
    status_code="${response: -3}"
    
    if [ "$status_code" = "200" ]; then
        test_passed "API Endpoint (With Auth)"
    else
        test_failed "API Endpoint (With Auth)" "HTTP $status_code"
    fi
}

# Test SSE endpoint
test_sse_endpoint() {
    log_info "Testing SSE endpoint"
    
    local headers
    headers=$(curl -s --max-time 10 -I "$WORKER_URL/sse" 2>/dev/null)
    
    if echo "$headers" | grep -qi "content-type.*text/event-stream"; then
        test_passed "SSE Endpoint Headers"
    else
        # Try with authentication if available
        if [ -n "$API_KEY" ]; then
            headers=$(curl -s --max-time 10 -I \
                -H "Authorization: Bearer $API_KEY" \
                "$WORKER_URL/sse" 2>/dev/null)
            
            if echo "$headers" | grep -qi "content-type.*text/event-stream"; then
                test_passed "SSE Endpoint Headers (With Auth)"
            else
                test_failed "SSE Endpoint Headers" "Missing text/event-stream content-type"
            fi
        else
            test_failed "SSE Endpoint Headers" "Missing text/event-stream content-type"
        fi
    fi
}

# Test worker performance
test_worker_performance() {
    log_info "Testing worker performance"
    
    local start_time
    local end_time
    local duration
    
    start_time=$(date +%s%N)
    
    if curl -s --max-time $TEST_TIMEOUT "$WORKER_URL/health" > /dev/null 2>&1; then
        end_time=$(date +%s%N)
        duration=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
        
        if [ $duration -lt 5000 ]; then # Less than 5 seconds
            test_passed "Worker Performance ($duration ms)"
        else
            test_failed "Worker Performance" "Slow response: $duration ms"
        fi
    else
        test_failed "Worker Performance" "Request failed"
    fi
}

# Test different HTTP methods
test_http_methods() {
    log_info "Testing HTTP methods"
    
    # Test GET
    if curl -s --max-time $TEST_TIMEOUT -X GET "$WORKER_URL/health" > /dev/null 2>&1; then
        test_passed "HTTP GET Method"
    else
        test_failed "HTTP GET Method" "GET request failed"
    fi
    
    # Test OPTIONS (CORS preflight)
    if curl -s --max-time $TEST_TIMEOUT -X OPTIONS "$WORKER_URL/health" > /dev/null 2>&1; then
        test_passed "HTTP OPTIONS Method"
    else
        test_failed "HTTP OPTIONS Method" "OPTIONS request failed"
    fi
    
    # Test POST (if API key is available)
    if [ -n "$API_KEY" ]; then
        local status_code
        status_code=$(curl -s --max-time $TEST_TIMEOUT -w "%{http_code}" -o /dev/null \
            -X POST \
            -H "Authorization: Bearer $API_KEY" \
            -H "Content-Type: application/json" \
            -d '{"test": "data"}' \
            "$WORKER_URL/api/test" 2>/dev/null)
        
        # Accept any response (404, 405, 200, etc.) as long as the worker responds
        if [ -n "$status_code" ] && [ "$status_code" != "000" ]; then
            test_passed "HTTP POST Method"
        else
            test_failed "HTTP POST Method" "POST request failed"
        fi
    fi
}

# Test error handling
test_error_handling() {
    log_info "Testing error handling"
    
    # Test non-existent endpoint
    local status_code
    status_code=$(curl -s --max-time $TEST_TIMEOUT -w "%{http_code}" -o /dev/null \
        "$WORKER_URL/nonexistent-endpoint" 2>/dev/null)
    
    if [ "$status_code" = "404" ] || [ "$status_code" = "502" ]; then
        test_passed "Error Handling (404/502)"
    else
        test_failed "Error Handling" "Expected 404 or 502, got $status_code"
    fi
}

# Test geographic distribution
test_geographic_distribution() {
    log_info "Testing geographic distribution"
    
    local response
    response=$(curl -s --max-time $TEST_TIMEOUT -I "$WORKER_URL/health" 2>/dev/null)
    
    if echo "$response" | grep -qi "cf-ray"; then
        local cf_ray
        cf_ray=$(echo "$response" | grep -i "cf-ray" | cut -d: -f2 | tr -d ' \r\n')
        test_passed "Geographic Distribution (CF-Ray: $cf_ray)"
    else
        test_failed "Geographic Distribution" "Missing CF-Ray header"
    fi
}

# Generate test report
generate_test_report() {
    local total_tests=$((TESTS_PASSED + TESTS_FAILED))
    local success_rate=0
    
    if [ $total_tests -gt 0 ]; then
        success_rate=$(( (TESTS_PASSED * 100) / total_tests ))
    fi
    
    echo ""
    log_message "========================================="
    log_message "🧪 CLOUDFLARE WORKER TEST RESULTS 🧪"
    log_message "========================================="
    echo ""
    
    log_info "📊 TEST SUMMARY:"
    log_message "✅ Tests Passed: $TESTS_PASSED"
    if [ $TESTS_FAILED -gt 0 ]; then
        log_error "❌ Tests Failed: $TESTS_FAILED"
    else
        log_message "❌ Tests Failed: $TESTS_FAILED"
    fi
    log_message "📈 Success Rate: $success_rate%"
    echo ""
    
    log_info "📋 DETAILED RESULTS:"
    for result in "${TEST_RESULTS[@]}"; do
        echo "  $result"
    done
    echo ""
    
    log_info "🔗 TESTED ENDPOINTS:"
    log_message "Worker URL: $WORKER_URL"
    log_message "Health: $WORKER_URL/health"
    log_message "SSE: $WORKER_URL/sse"
    log_message "API: $WORKER_URL/api"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        log_message "🎉 All tests passed! Worker is functioning correctly."
    else
        log_warning "⚠️ Some tests failed. Check the results above for details."
    fi
    
    # Return appropriate exit code
    if [ $TESTS_FAILED -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

# Main testing function
main() {
    log_message "Starting Cloudflare Worker tests"
    log_info "Worker URL: $WORKER_URL"
    log_info "Domain: $DOMAIN"
    log_info "Test Timeout: ${TEST_TIMEOUT}s"
    
    if [ -n "$API_KEY" ]; then
        log_info "API Key: Provided (will test authenticated endpoints)"
    else
        log_warning "API Key: Not provided (skipping authenticated tests)"
    fi
    
    echo ""
    
    # Run all tests
    test_basic_connectivity
    test_health_endpoint
    test_cors_headers
    test_api_endpoint_no_auth
    test_api_endpoint_with_auth
    test_sse_endpoint
    test_worker_performance
    test_http_methods
    test_error_handling
    test_geographic_distribution
    
    # Generate and display report
    generate_test_report
}

# Run main function
main "$@"

