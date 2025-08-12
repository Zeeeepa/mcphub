#!/bin/bash

#########################################
# MCPhub Cloudflare Integration Setup
# Connects local MCPhub to Cloudflare Worker
#########################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
WORKER_URL="https://mcp.pixeliumperfecto.workers.dev"
LOCAL_MCPHUB_PORT=${LOCAL_MCPHUB_PORT:-3000}
TUNNEL_NAME=${TUNNEL_NAME:-"mcphub-tunnel"}

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

# Check if MCPhub is running locally
check_local_mcphub() {
    log_info "Checking if MCPhub is running locally..."
    
    if curl -s --max-time 5 "http://localhost:$LOCAL_MCPHUB_PORT/health" > /dev/null 2>&1; then
        log_message "✅ MCPhub is running on port $LOCAL_MCPHUB_PORT"
        return 0
    else
        log_warning "⚠️ MCPhub is not running on port $LOCAL_MCPHUB_PORT"
        return 1
    fi
}

# Install cloudflared if not present
install_cloudflared() {
    if command -v cloudflared &> /dev/null; then
        log_info "Cloudflared already installed: $(cloudflared --version)"
        return 0
    fi
    
    log_message "Installing cloudflared..."
    
    # Detect OS and install accordingly
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        sudo dpkg -i cloudflared.deb
        rm cloudflared.deb
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install cloudflared
        else
            log_error "Homebrew not found. Please install cloudflared manually."
            exit 1
        fi
    else
        log_error "Unsupported OS. Please install cloudflared manually."
        exit 1
    fi
    
    log_message "Cloudflared installed successfully"
}

# Setup Cloudflare Tunnel
setup_tunnel() {
    log_message "Setting up Cloudflare Tunnel..."
    
    # Check if tunnel already exists
    if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
        log_info "Tunnel '$TUNNEL_NAME' already exists"
        TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
    else
        log_info "Creating new tunnel '$TUNNEL_NAME'..."
        cloudflared tunnel create "$TUNNEL_NAME"
        TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
    fi
    
    log_message "Tunnel ID: $TUNNEL_ID"
    
    # Create tunnel configuration
    mkdir -p ~/.cloudflared
    cat > ~/.cloudflared/config.yml <<EOF
tunnel: $TUNNEL_ID
credentials-file: ~/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: mcp.pixeliumperfecto.workers.dev
    service: http://localhost:$LOCAL_MCPHUB_PORT
    originRequest:
      # Optimize for SSE connections
      http2Origin: false
      keepAliveConnections: 10
      keepAliveTimeout: 90s
      connectTimeout: 30s
      tlsTimeout: 30s
  - service: http_status:404
EOF
    
    log_message "Tunnel configuration created"
}

# Start tunnel service
start_tunnel() {
    log_message "Starting Cloudflare Tunnel..."
    
    # Check if tunnel is already running
    if pgrep -f "cloudflared tunnel run" > /dev/null; then
        log_warning "Tunnel is already running"
        return 0
    fi
    
    # Start tunnel in background
    nohup cloudflared tunnel run "$TUNNEL_NAME" > /tmp/cloudflare-tunnel.log 2>&1 &
    
    # Wait a moment for tunnel to start
    sleep 5
    
    if pgrep -f "cloudflared tunnel run" > /dev/null; then
        log_message "✅ Tunnel started successfully"
        log_info "Tunnel logs: tail -f /tmp/cloudflare-tunnel.log"
    else
        log_error "❌ Failed to start tunnel"
        log_error "Check logs: cat /tmp/cloudflare-tunnel.log"
        exit 1
    fi
}

# Test the connection
test_connection() {
    log_message "Testing connection..."
    
    # Wait for tunnel to be ready
    log_info "Waiting for tunnel to be ready..."
    sleep 10
    
    # Test worker health endpoint
    log_info "Testing worker endpoint..."
    if curl -s --max-time 30 "$WORKER_URL/health" | jq -r '.worker.status' | grep -q "healthy"; then
        log_message "✅ Worker is healthy"
    else
        log_warning "⚠️ Worker health check inconclusive"
    fi
    
    # Test backend connectivity through worker
    log_info "Testing backend connectivity through worker..."
    local backend_status
    backend_status=$(curl -s --max-time 30 "$WORKER_URL/health" | jq -r '.backend.status // "unknown"')
    
    if [ "$backend_status" = "healthy" ]; then
        log_message "✅ Backend is reachable through worker"
    else
        log_warning "⚠️ Backend status: $backend_status"
        log_info "This may be normal if MCPhub is not running or tunnel is still connecting"
    fi
}

# Generate client configuration
generate_client_config() {
    log_message "Generating client configuration..."
    
    cat > mcphub-client-config.json <<EOF
{
  "mcpServers": {
    "MCPhub": {
      "type": "sse",
      "url": "$WORKER_URL/sse",
      "keepAliveInterval": 60000,
      "owner": "admin",
      "env": "YOUR_API_KEY_HERE"
    }
  }
}
EOF
    
    log_message "Client configuration saved to mcphub-client-config.json"
}

# Create management scripts
create_management_scripts() {
    log_message "Creating management scripts..."
    
    # Start script
    cat > start-mcphub-tunnel.sh <<'EOF'
#!/bin/bash
echo "Starting MCPhub Cloudflare Tunnel..."
if ! pgrep -f "cloudflared tunnel run" > /dev/null; then
    nohup cloudflared tunnel run mcphub-tunnel > /tmp/cloudflare-tunnel.log 2>&1 &
    echo "Tunnel started. Logs: tail -f /tmp/cloudflare-tunnel.log"
else
    echo "Tunnel is already running"
fi
EOF
    
    # Stop script
    cat > stop-mcphub-tunnel.sh <<'EOF'
#!/bin/bash
echo "Stopping MCPhub Cloudflare Tunnel..."
pkill -f "cloudflared tunnel run"
echo "Tunnel stopped"
EOF
    
    # Status script
    cat > mcphub-tunnel-status.sh <<'EOF'
#!/bin/bash
echo "=== MCPhub Cloudflare Tunnel Status ==="
echo ""

# Check tunnel process
if pgrep -f "cloudflared tunnel run" > /dev/null; then
    echo "✅ Tunnel Process: Running"
    echo "   PID: $(pgrep -f 'cloudflared tunnel run')"
else
    echo "❌ Tunnel Process: Not running"
fi

# Check local MCPhub
if curl -s --max-time 5 http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Local MCPhub: Running"
else
    echo "❌ Local MCPhub: Not running"
fi

# Check worker
WORKER_STATUS=$(curl -s --max-time 10 https://mcp.pixeliumperfecto.workers.dev/health | jq -r '.worker.status // "unknown"' 2>/dev/null)
if [ "$WORKER_STATUS" = "healthy" ]; then
    echo "✅ Cloudflare Worker: Healthy"
else
    echo "⚠️ Cloudflare Worker: $WORKER_STATUS"
fi

# Check backend through worker
BACKEND_STATUS=$(curl -s --max-time 10 https://mcp.pixeliumperfecto.workers.dev/health | jq -r '.backend.status // "unknown"' 2>/dev/null)
if [ "$BACKEND_STATUS" = "healthy" ]; then
    echo "✅ Backend via Worker: Healthy"
else
    echo "⚠️ Backend via Worker: $BACKEND_STATUS"
fi

echo ""
echo "=== Endpoints ==="
echo "Worker URL: https://mcp.pixeliumperfecto.workers.dev"
echo "Health Check: https://mcp.pixeliumperfecto.workers.dev/health"
echo "SSE Endpoint: https://mcp.pixeliumperfecto.workers.dev/sse"
echo ""
echo "=== Logs ==="
echo "Tunnel logs: tail -f /tmp/cloudflare-tunnel.log"
EOF
    
    chmod +x start-mcphub-tunnel.sh stop-mcphub-tunnel.sh mcphub-tunnel-status.sh
    
    log_message "Management scripts created:"
    log_info "  - start-mcphub-tunnel.sh"
    log_info "  - stop-mcphub-tunnel.sh"
    log_info "  - mcphub-tunnel-status.sh"
}

# Main setup function
main() {
    log_message "========================================="
    log_message "🚀 MCPhub Cloudflare Integration Setup 🚀"
    log_message "========================================="
    echo ""
    
    log_info "Worker URL: $WORKER_URL"
    log_info "Local MCPhub Port: $LOCAL_MCPHUB_PORT"
    log_info "Tunnel Name: $TUNNEL_NAME"
    echo ""
    
    # Check prerequisites
    check_local_mcphub
    
    # Install cloudflared
    install_cloudflared
    
    # Setup tunnel
    setup_tunnel
    
    # Start tunnel
    start_tunnel
    
    # Test connection
    test_connection
    
    # Generate client config
    generate_client_config
    
    # Create management scripts
    create_management_scripts
    
    echo ""
    log_message "========================================="
    log_message "🎉 SETUP COMPLETE! 🎉"
    log_message "========================================="
    echo ""
    
    log_info "📊 SETUP SUMMARY:"
    log_message "✅ Cloudflare Worker: https://mcp.pixeliumperfecto.workers.dev"
    log_message "✅ Tunnel Configuration: ~/.cloudflared/config.yml"
    log_message "✅ Client Configuration: mcphub-client-config.json"
    log_message "✅ Management Scripts: start/stop/status scripts created"
    echo ""
    
    log_info "🔗 ENDPOINTS:"
    log_message "Health Check: $WORKER_URL/health"
    log_message "SSE Endpoint: $WORKER_URL/sse"
    log_message "API Endpoint: $WORKER_URL/api"
    echo ""
    
    log_info "🛠️ MANAGEMENT COMMANDS:"
    log_message "./start-mcphub-tunnel.sh    - Start the tunnel"
    log_message "./stop-mcphub-tunnel.sh     - Stop the tunnel"
    log_message "./mcphub-tunnel-status.sh   - Check status"
    echo ""
    
    log_warning "⚠️ NEXT STEPS:"
    log_warning "1. Ensure MCPhub is running: npm start or node server.js"
    log_warning "2. Generate an API key in MCPhub dashboard"
    log_warning "3. Replace 'YOUR_API_KEY_HERE' in mcphub-client-config.json"
    log_warning "4. Test the connection: curl $WORKER_URL/health"
    echo ""
    
    log_message "🎊 Your MCPhub is now accessible via Cloudflare Worker!"
}

# Run main function
main "$@"

