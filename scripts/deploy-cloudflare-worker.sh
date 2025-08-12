#!/bin/bash

#########################################
# Cloudflare Worker Deployment Script for MCPhub
# Deploys a Cloudflare Worker to proxy MCP requests
#########################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration from environment variables
CLOUDFLARE_API_KEY=${CLOUDFLARE_API_KEY:-""}
CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:-""}
CLOUDFLARE_WORKER_NAME=${CLOUDFLARE_WORKER_NAME:-"mcp"}
DOMAIN=${DOMAIN:-"pixeliumperfecto.com"}
MCPHUB_BACKEND_URL=${MCPHUB_BACKEND_URL:-""}
MCPHUB_API_KEY=${MCPHUB_API_KEY:-""}

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

# Validate required environment variables
validate_environment() {
    log_message "Validating environment variables..."
    
    if [ -z "$CLOUDFLARE_API_KEY" ]; then
        log_error "CLOUDFLARE_API_KEY is required"
        exit 1
    fi
    
    if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
        log_error "CLOUDFLARE_ACCOUNT_ID is required"
        exit 1
    fi
    
    log_message "Environment validation passed"
}

# Install wrangler CLI if not present
install_wrangler() {
    if command -v wrangler &> /dev/null; then
        log_info "Wrangler CLI already installed: $(wrangler --version)"
        return 0
    fi
    
    log_message "Installing Wrangler CLI..."
    
    # Install via npm
    if command -v npm &> /dev/null; then
        npm install -g wrangler
    else
        log_error "npm is required to install wrangler"
        exit 1
    fi
    
    log_message "Wrangler CLI installed successfully"
}

# Setup wrangler authentication
setup_wrangler_auth() {
    log_message "Setting up Wrangler authentication..."
    
    # Set environment variables for wrangler
    export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_KEY"
    export CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"
    
    # Verify authentication
    if wrangler whoami > /dev/null 2>&1; then
        log_message "Wrangler authentication successful"
    else
        log_warning "Wrangler authentication may have failed, but continuing..."
    fi
}

# Determine backend URL
determine_backend_url() {
    if [ -n "$MCPHUB_BACKEND_URL" ]; then
        log_info "Using provided backend URL: $MCPHUB_BACKEND_URL"
        return 0
    fi
    
    # Try to detect if we're running locally or need tunnel
    if curl -s --max-time 5 http://localhost:3000/health > /dev/null 2>&1; then
        log_info "Detected local MCPhub instance"
        
        # Check if Cloudflare Tunnel is running
        if [ -f "$HOME/.cloudflared/config.yml" ]; then
            # Extract tunnel domain from config
            TUNNEL_DOMAIN=$(grep -E "hostname:" "$HOME/.cloudflared/config.yml" | head -1 | awk '{print $2}' || echo "")
            if [ -n "$TUNNEL_DOMAIN" ]; then
                MCPHUB_BACKEND_URL="https://$TUNNEL_DOMAIN"
                log_info "Using Cloudflare Tunnel URL: $MCPHUB_BACKEND_URL"
            else
                log_warning "Cloudflare Tunnel config found but no hostname detected"
                MCPHUB_BACKEND_URL="http://localhost:3000"
            fi
        else
            log_warning "No Cloudflare Tunnel detected, using localhost (worker will need tunnel)"
            MCPHUB_BACKEND_URL="http://localhost:3000"
        fi
    else
        log_warning "No local MCPhub detected, using default backend URL"
        MCPHUB_BACKEND_URL="https://$DOMAIN"
    fi
    
    log_info "Backend URL determined: $MCPHUB_BACKEND_URL"
}

# Update wrangler.toml with current configuration
update_wrangler_config() {
    log_message "Updating wrangler configuration..."
    
    cd "$WORKER_DIR"
    
    # Update wrangler.toml with current values
    cat > wrangler.toml <<EOF
name = "$CLOUDFLARE_WORKER_NAME"
main = "src/index.js"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[env.production]
name = "$CLOUDFLARE_WORKER_NAME"
route = { pattern = "$CLOUDFLARE_WORKER_NAME.$DOMAIN/*", zone_name = "$DOMAIN" }

[env.development]
name = "$CLOUDFLARE_WORKER_NAME-dev"

# Environment variables for the worker
[vars]
MCPHUB_BACKEND_URL = "$MCPHUB_BACKEND_URL"
ALLOWED_ORIGINS = "https://$DOMAIN,https://www.$DOMAIN"

# Build configuration
[build]
command = ""
EOF
    
    log_message "Wrangler configuration updated"
    cd ..
}

# Install worker dependencies
install_dependencies() {
    log_message "Installing worker dependencies..."
    
    cd "$WORKER_DIR"
    
    if [ -f "package.json" ]; then
        if command -v npm &> /dev/null; then
            npm install
        else
            log_warning "npm not found, skipping dependency installation"
        fi
    fi
    
    cd ..
}

# Set worker secrets
set_worker_secrets() {
    log_message "Setting worker secrets..."
    
    cd "$WORKER_DIR"
    
    # Set API key secret if provided
    if [ -n "$MCPHUB_API_KEY" ]; then
        echo "$MCPHUB_API_KEY" | wrangler secret put MCPHUB_API_KEY
        log_info "MCPhub API key secret set"
    else
        log_info "No MCPhub API key provided, skipping secret setup"
    fi
    
    cd ..
}

# Deploy the worker
deploy_worker() {
    log_message "Deploying Cloudflare Worker..."
    
    cd "$WORKER_DIR"
    
    # Deploy to production
    if wrangler deploy --env production; then
        log_message "Worker deployed successfully to production"
    else
        log_error "Worker deployment failed"
        cd ..
        exit 1
    fi
    
    cd ..
}

# Test the deployed worker
test_worker() {
    log_message "Testing deployed worker..."
    
    local worker_url="https://$CLOUDFLARE_WORKER_NAME.$DOMAIN"
    
    # Test health endpoint
    log_info "Testing health endpoint: $worker_url/health"
    if curl -s --max-time 30 "$worker_url/health" > /dev/null; then
        log_message "✅ Worker health check passed"
    else
        log_warning "⚠️ Worker health check failed (may be normal if backend is not accessible)"
    fi
    
    # Test CORS preflight
    log_info "Testing CORS preflight..."
    if curl -s --max-time 10 -X OPTIONS "$worker_url/api/health" \
        -H "Origin: https://$DOMAIN" \
        -H "Access-Control-Request-Method: GET" > /dev/null; then
        log_message "✅ CORS preflight test passed"
    else
        log_warning "⚠️ CORS preflight test failed"
    fi
}

# Setup DNS record
setup_dns() {
    log_message "Setting up DNS record..."
    
    # The route in wrangler.toml should handle this automatically
    # But we can verify the DNS record exists
    
    log_info "DNS should be automatically configured via Cloudflare Worker route"
    log_info "Worker will be available at: https://$CLOUDFLARE_WORKER_NAME.$DOMAIN"
}

# Generate client configuration
generate_client_config() {
    log_message "Generating client configuration..."
    
    local worker_url="https://$CLOUDFLARE_WORKER_NAME.$DOMAIN"
    
    cat > mcphub-worker-config.json <<EOF
{
  "mcpServers": {
    "MCPhub": {
      "type": "sse",
      "url": "$worker_url/sse",
      "keepAliveInterval": 60000,
      "owner": "admin",
      "env": "YOUR_API_KEY_HERE"
    }
  }
}
EOF
    
    log_message "Client configuration saved to mcphub-worker-config.json"
}

# Main deployment function
main() {
    log_message "Starting Cloudflare Worker deployment for MCPhub"
    log_info "Worker Name: $CLOUDFLARE_WORKER_NAME"
    log_info "Domain: $DOMAIN"
    
    # Validate environment
    validate_environment
    
    # Install and setup wrangler
    install_wrangler
    setup_wrangler_auth
    
    # Determine backend configuration
    determine_backend_url
    
    # Update configuration
    update_wrangler_config
    
    # Install dependencies
    install_dependencies
    
    # Set secrets
    set_worker_secrets
    
    # Deploy worker
    deploy_worker
    
    # Setup DNS
    setup_dns
    
    # Test deployment
    test_worker
    
    # Generate client config
    generate_client_config
    
    echo ""
    log_message "========================================="
    log_message "🎉 CLOUDFLARE WORKER DEPLOYMENT COMPLETE! 🎉"
    log_message "========================================="
    echo ""
    
    log_info "📊 DEPLOYMENT INFORMATION:"
    log_message "✅ Worker Name: $CLOUDFLARE_WORKER_NAME"
    log_message "✅ Worker URL: https://$CLOUDFLARE_WORKER_NAME.$DOMAIN"
    log_message "✅ Backend URL: $MCPHUB_BACKEND_URL"
    log_message "✅ Domain: $DOMAIN"
    echo ""
    
    log_info "🔗 ENDPOINTS:"
    log_message "Health Check: https://$CLOUDFLARE_WORKER_NAME.$DOMAIN/health"
    log_message "SSE Endpoint: https://$CLOUDFLARE_WORKER_NAME.$DOMAIN/sse"
    log_message "API Endpoint: https://$CLOUDFLARE_WORKER_NAME.$DOMAIN/api"
    log_message "Dashboard: https://$CLOUDFLARE_WORKER_NAME.$DOMAIN/"
    echo ""
    
    log_info "🔑 CLIENT CONFIGURATION:"
    log_message "Configuration saved to: mcphub-worker-config.json"
    echo ""
    cat mcphub-worker-config.json
    echo ""
    
    log_warning "⚠️ IMPORTANT NEXT STEPS:"
    log_warning "1. Ensure your MCPhub backend is accessible at: $MCPHUB_BACKEND_URL"
    log_warning "2. Generate an API key in MCPhub dashboard"
    log_warning "3. Replace 'YOUR_API_KEY_HERE' in the client configuration"
    log_warning "4. Test the connection: curl https://$CLOUDFLARE_WORKER_NAME.$DOMAIN/health"
    echo ""
    
    log_message "Deployment log: $LOG_FILE"
    log_message "Cloudflare Worker is ready!"
}

# Run main function
main "$@"

