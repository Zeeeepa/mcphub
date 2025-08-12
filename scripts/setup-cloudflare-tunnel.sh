#!/bin/bash

#########################################
# Cloudflare Tunnel Setup for WSL2 + MCPhub
# Automated setup script for secure tunnel connections
#########################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration variables
DOMAIN=${DOMAIN:-"pixeliumperfecto.co.uk"}
TUNNEL_NAME=${TUNNEL_NAME:-"mcphub-wsl2"}
MCPHUB_PORT=${MCPHUB_PORT:-3000}
CONFIG_DIR="$HOME/.cloudflared"
LOG_FILE="/tmp/cloudflare-tunnel-setup.log"

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

# Check if running in WSL2
check_wsl2() {
    if ! grep -q microsoft /proc/version 2>/dev/null; then
        log_warning "This script is optimized for WSL2. Continuing anyway..."
    else
        log_info "WSL2 environment detected"
    fi
}

# Install Cloudflare Tunnel (cloudflared)
install_cloudflared() {
    log_message "Installing Cloudflare Tunnel (cloudflared)..."
    
    # Check if already installed
    if command -v cloudflared &> /dev/null; then
        log_info "cloudflared is already installed"
        cloudflared version
        return 0
    fi

    # Download and install cloudflared
    local arch
    arch=$(uname -m)
    case $arch in
        x86_64)
            arch="amd64"
            ;;
        aarch64)
            arch="arm64"
            ;;
        *)
            log_error "Unsupported architecture: $arch"
            exit 1
            ;;
    esac

    local download_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}.deb"
    local temp_file="/tmp/cloudflared.deb"

    log_info "Downloading cloudflared for $arch..."
    curl -L --output "$temp_file" "$download_url"

    log_info "Installing cloudflared..."
    sudo dpkg -i "$temp_file"
    
    # Fix any dependency issues
    sudo apt-get install -f -y

    rm -f "$temp_file"
    
    log_message "cloudflared installed successfully"
    cloudflared version
}

# Authenticate with Cloudflare
authenticate_cloudflare() {
    log_message "Authenticating with Cloudflare..."
    
    # Check if already authenticated
    if [ -f "$CONFIG_DIR/cert.pem" ]; then
        log_info "Already authenticated with Cloudflare"
        return 0
    fi

    log_info "Opening browser for Cloudflare authentication..."
    log_info "Please complete the authentication in your browser"
    
    cloudflared tunnel login
    
    if [ -f "$CONFIG_DIR/cert.pem" ]; then
        log_message "Cloudflare authentication successful"
    else
        log_error "Cloudflare authentication failed"
        exit 1
    fi
}

# Create Cloudflare Tunnel
create_tunnel() {
    log_message "Creating Cloudflare Tunnel: $TUNNEL_NAME"
    
    # Check if tunnel already exists
    if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
        log_info "Tunnel '$TUNNEL_NAME' already exists"
        TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
    else
        log_info "Creating new tunnel..."
        cloudflared tunnel create "$TUNNEL_NAME"
        TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
    fi
    
    log_message "Tunnel ID: $TUNNEL_ID"
    echo "$TUNNEL_ID" > "$CONFIG_DIR/tunnel_id"
}

# Configure tunnel
configure_tunnel() {
    log_message "Configuring tunnel..."
    
    # Get tunnel ID
    if [ -f "$CONFIG_DIR/tunnel_id" ]; then
        TUNNEL_ID=$(cat "$CONFIG_DIR/tunnel_id")
    else
        TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
        echo "$TUNNEL_ID" > "$CONFIG_DIR/tunnel_id"
    fi

    # Create tunnel configuration
    cat > "$CONFIG_DIR/config.yml" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CONFIG_DIR/$TUNNEL_ID.json

# Ingress rules - order matters!
ingress:
  # Main MCPhub application
  - hostname: $DOMAIN
    service: http://localhost:$MCPHUB_PORT
    originRequest:
      # Important for SSE connections
      noTLSVerify: true
      connectTimeout: 30s
      tlsTimeout: 30s
      tcpKeepAlive: 30s
      keepAliveConnections: 10
      keepAliveTimeout: 90s
      httpHostHeader: $DOMAIN
  
  # Subdomain for API access (optional)
  - hostname: api.$DOMAIN
    service: http://localhost:$MCPHUB_PORT
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      tlsTimeout: 30s
      tcpKeepAlive: 30s
      keepAliveConnections: 10
      keepAliveTimeout: 90s
      httpHostHeader: api.$DOMAIN
  
  # Health check endpoint
  - hostname: health.$DOMAIN
    service: http://localhost:$MCPHUB_PORT/health
  
  # Catch-all rule (required)
  - service: http_status:404

# Tunnel-level configuration
originRequest:
  # Disable HTTP/2 for better SSE compatibility
  http2Origin: false
  # Keep connections alive for SSE
  keepAliveConnections: 10
  keepAliveTimeout: 90s

# Logging
loglevel: info
logfile: /tmp/cloudflared.log

# Metrics (optional)
metrics: localhost:8080
EOF

    log_message "Tunnel configuration created at $CONFIG_DIR/config.yml"
}

# Set up DNS routing
setup_dns() {
    log_message "Setting up DNS routing..."
    
    # Get tunnel ID
    TUNNEL_ID=$(cat "$CONFIG_DIR/tunnel_id")
    
    # Route main domain
    log_info "Routing $DOMAIN to tunnel..."
    if cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN"; then
        log_message "DNS routing configured for $DOMAIN"
    else
        log_warning "DNS routing may have failed. You might need to configure it manually in Cloudflare dashboard."
    fi
    
    # Route API subdomain (optional)
    log_info "Routing api.$DOMAIN to tunnel..."
    if cloudflared tunnel route dns "$TUNNEL_NAME" "api.$DOMAIN"; then
        log_message "DNS routing configured for api.$DOMAIN"
    else
        log_warning "API subdomain routing failed. This is optional."
    fi
}

# Create systemd service for auto-start
create_service() {
    log_message "Creating systemd service for tunnel auto-start..."
    
    # Note: WSL2 has limited systemd support, so we'll create the service file
    # but also provide alternative startup methods
    
    sudo tee /etc/systemd/system/cloudflared-tunnel.service > /dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel for MCPhub
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=/usr/local/bin/cloudflared tunnel --config $CONFIG_DIR/config.yml run
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    # Try to enable the service (may not work in all WSL2 setups)
    if sudo systemctl enable cloudflared-tunnel.service 2>/dev/null; then
        log_message "Systemd service created and enabled"
    else
        log_warning "Systemd service created but could not be enabled (normal in WSL2)"
    fi
}

# Create Windows startup script
create_windows_startup() {
    log_message "Creating Windows startup script..."
    
    local windows_user
    windows_user=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r\n' || echo "User")
    
    local startup_script="/mnt/c/Users/$windows_user/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/mcphub-tunnel.bat"
    local startup_dir
    startup_dir=$(dirname "$startup_script")
    
    if [ -d "$startup_dir" ]; then
        cat > "$startup_script" <<EOF
@echo off
REM MCPhub Cloudflare Tunnel Startup Script
REM This script starts the Cloudflare tunnel when Windows starts

echo Starting MCPhub Cloudflare Tunnel...
wsl -d Ubuntu -u $USER -- bash -c "cd ~ && cloudflared tunnel --config $CONFIG_DIR/config.yml run > /tmp/tunnel.log 2>&1 &"
echo MCPhub tunnel started. Check /tmp/tunnel.log in WSL for logs.
EOF
        log_message "Windows startup script created at: $startup_script"
    else
        log_warning "Could not create Windows startup script. Startup directory not found."
    fi
}

# Create manual start/stop scripts
create_control_scripts() {
    log_message "Creating tunnel control scripts..."
    
    # Start script
    cat > "$HOME/start-tunnel.sh" <<EOF
#!/bin/bash
echo "Starting MCPhub Cloudflare Tunnel..."
cloudflared tunnel --config $CONFIG_DIR/config.yml run > /tmp/tunnel.log 2>&1 &
echo \$! > /tmp/tunnel.pid
echo "Tunnel started. PID: \$(cat /tmp/tunnel.pid)"
echo "Logs: tail -f /tmp/tunnel.log"
EOF

    # Stop script
    cat > "$HOME/stop-tunnel.sh" <<EOF
#!/bin/bash
if [ -f /tmp/tunnel.pid ]; then
    PID=\$(cat /tmp/tunnel.pid)
    echo "Stopping tunnel (PID: \$PID)..."
    kill \$PID 2>/dev/null
    rm -f /tmp/tunnel.pid
    echo "Tunnel stopped."
else
    echo "No tunnel PID file found. Trying to kill by name..."
    pkill -f cloudflared
fi
EOF

    # Status script
    cat > "$HOME/tunnel-status.sh" <<EOF
#!/bin/bash
if [ -f /tmp/tunnel.pid ]; then
    PID=\$(cat /tmp/tunnel.pid)
    if ps -p \$PID > /dev/null; then
        echo "Tunnel is running (PID: \$PID)"
        echo "Logs: tail -f /tmp/tunnel.log"
    else
        echo "Tunnel PID file exists but process is not running"
        rm -f /tmp/tunnel.pid
    fi
else
    if pgrep -f cloudflared > /dev/null; then
        echo "Tunnel appears to be running (no PID file)"
    else
        echo "Tunnel is not running"
    fi
fi
echo ""
echo "Recent tunnel logs:"
tail -n 10 /tmp/tunnel.log 2>/dev/null || echo "No logs found"
EOF

    chmod +x "$HOME/start-tunnel.sh" "$HOME/stop-tunnel.sh" "$HOME/tunnel-status.sh"
    
    log_message "Control scripts created:"
    log_info "  Start tunnel: ~/start-tunnel.sh"
    log_info "  Stop tunnel: ~/stop-tunnel.sh"
    log_info "  Check status: ~/tunnel-status.sh"
}

# Test tunnel connection
test_tunnel() {
    log_message "Testing tunnel connection..."
    
    # Start tunnel in background for testing
    log_info "Starting tunnel for testing..."
    cloudflared tunnel --config "$CONFIG_DIR/config.yml" run > /tmp/tunnel-test.log 2>&1 &
    local tunnel_pid=$!
    
    # Wait a moment for tunnel to establish
    sleep 10
    
    # Test connection
    log_info "Testing connection to https://$DOMAIN..."
    if curl -s --max-time 30 "https://$DOMAIN/health" > /dev/null; then
        log_message "✅ Tunnel connection test successful!"
    else
        log_warning "⚠️ Tunnel connection test failed. This might be normal if MCPhub is not running yet."
    fi
    
    # Stop test tunnel
    kill $tunnel_pid 2>/dev/null || true
    wait $tunnel_pid 2>/dev/null || true
    
    log_info "Test tunnel stopped"
}

# Main setup function
main() {
    log_message "Starting Cloudflare Tunnel setup for MCPhub on WSL2"
    log_info "Domain: $DOMAIN"
    log_info "Tunnel Name: $TUNNEL_NAME"
    log_info "MCPhub Port: $MCPHUB_PORT"
    
    # Create config directory
    mkdir -p "$CONFIG_DIR"
    
    # Run setup steps
    check_wsl2
    install_cloudflared
    authenticate_cloudflare
    create_tunnel
    configure_tunnel
    setup_dns
    create_service
    create_windows_startup
    create_control_scripts
    
    # Test if requested
    if [ "${TEST_TUNNEL:-yes}" = "yes" ]; then
        test_tunnel
    fi
    
    echo ""
    log_message "========================================="
    log_message "🎉 CLOUDFLARE TUNNEL SETUP COMPLETE! 🎉"
    log_message "========================================="
    echo ""
    
    log_info "📊 TUNNEL INFORMATION:"
    log_message "✅ Domain: https://$DOMAIN"
    log_message "✅ API Domain: https://api.$DOMAIN (optional)"
    log_message "✅ Tunnel Name: $TUNNEL_NAME"
    log_message "✅ Tunnel ID: $(cat "$CONFIG_DIR/tunnel_id")"
    log_message "✅ Config File: $CONFIG_DIR/config.yml"
    echo ""
    
    log_info "🚀 STARTING THE TUNNEL:"
    log_message "Manual start: ~/start-tunnel.sh"
    log_message "Auto-start: Windows startup script created"
    log_message "Check status: ~/tunnel-status.sh"
    log_message "Stop tunnel: ~/stop-tunnel.sh"
    echo ""
    
    log_info "🔧 MCPHUB CLIENT CONFIGURATION:"
    log_message "Use this in your MCP client configuration:"
    echo ""
    cat <<EOF
{
  "mcpServers": {
    "MCPhub": {
      "type": "sse",
      "url": "https://$DOMAIN/sse",
      "keepAliveInterval": 60000,
      "owner": "admin",
      "env": "YOUR_API_KEY_HERE"
    }
  }
}
EOF
    echo ""
    
    log_warning "⚠️ IMPORTANT NEXT STEPS:"
    log_warning "1. Start MCPhub: Make sure MCPhub is running on port $MCPHUB_PORT"
    log_warning "2. Start tunnel: Run ~/start-tunnel.sh"
    log_warning "3. Get API key: Generate an API key in MCPhub dashboard"
    log_warning "4. Test connection: Visit https://$DOMAIN"
    echo ""
    
    log_message "Setup log: $LOG_FILE"
    log_message "Cloudflare Tunnel is ready!"
}

# Run main function
main "$@"

