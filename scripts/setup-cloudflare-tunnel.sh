#!/bin/bash

#########################################
# Cloudflare Tunnel Setup Script for MCPhub
# Sets up a Cloudflare Tunnel to expose MCPhub to the internet
#########################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN=${DOMAIN:-"pixeliumperfecto.co.uk"}
TUNNEL_NAME=${TUNNEL_NAME:-"mcphub-wsl2"}
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

# Check if domain is provided
if [ -z "$DOMAIN" ]; then
    log_error "Domain is required. Please set the DOMAIN environment variable."
    exit 1
fi

# Create log file
touch "$LOG_FILE"
log_message "Starting Cloudflare Tunnel setup for $DOMAIN"

# Install cloudflared if not already installed
if ! command -v cloudflared &> /dev/null; then
    log_message "Installing cloudflared..."
    
    # Download and install cloudflared
    curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    sudo dpkg -i cloudflared.deb
    sudo apt-get install -f -y
    rm cloudflared.deb
    
    log_message "cloudflared installed successfully"
else
    log_info "cloudflared is already installed: $(cloudflared --version)"
fi

# Check if already authenticated
if [ -f "$HOME/.cloudflared/cert.pem" ]; then
    log_info "Already authenticated with Cloudflare"
else
    # Authenticate with Cloudflare
    log_message "Authenticating with Cloudflare..."
    log_warning "This will open a browser window. Please log in to your Cloudflare account and authorize the tunnel."
    cloudflared tunnel login
    log_message "Authentication successful"
fi

# Check if tunnel already exists
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
    log_info "Tunnel '$TUNNEL_NAME' already exists"
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
else
    # Create tunnel
    log_message "Creating tunnel '$TUNNEL_NAME'..."
    TUNNEL_ID=$(cloudflared tunnel create "$TUNNEL_NAME" | grep -oP 'Created tunnel \K[a-z0-9-]+')
    log_message "Tunnel created with ID: $TUNNEL_ID"
fi

# Create config directory
mkdir -p "$HOME/.cloudflared"

# Create tunnel configuration
log_message "Creating tunnel configuration..."
cat > "$HOME/.cloudflared/config.yml" <<EOF
# Tunnel configuration for MCPhub
tunnel: $TUNNEL_ID
credentials-file: $HOME/.cloudflared/${TUNNEL_ID}.json

# Ingress rules - order matters!
ingress:
  # Main MCPhub application
  - hostname: $DOMAIN
    service: http://localhost:3000
    originRequest:
      # Important for SSE connections
      noTLSVerify: true
      connectTimeout: 30s
      tlsTimeout: 30s
      tcpKeepAlive: 30s
      keepAliveConnections: 10
      keepAliveTimeout: 90s
      httpHostHeader: $DOMAIN
  
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
EOF

log_message "Tunnel configuration created at $HOME/.cloudflared/config.yml"

# Route DNS
log_message "Routing DNS for $DOMAIN to tunnel..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN"
log_message "DNS routing complete"

# Create management scripts
log_message "Creating management scripts..."

# Start script
cat > "$HOME/start-tunnel.sh" <<EOF
#!/bin/bash
echo "Starting Cloudflare Tunnel for MCPhub..."
cloudflared tunnel --config $HOME/.cloudflared/config.yml run > /tmp/tunnel.log 2>&1 &
echo "Tunnel started. Check /tmp/tunnel.log for logs."
EOF
chmod +x "$HOME/start-tunnel.sh"

# Stop script
cat > "$HOME/stop-tunnel.sh" <<EOF
#!/bin/bash
echo "Stopping Cloudflare Tunnel for MCPhub..."
pkill -f "cloudflared tunnel --config"
echo "Tunnel stopped."
EOF
chmod +x "$HOME/stop-tunnel.sh"

# Status script
cat > "$HOME/tunnel-status.sh" <<EOF
#!/bin/bash
echo "Cloudflare Tunnel Status:"
if pgrep -f "cloudflared tunnel --config" > /dev/null; then
    echo "Tunnel is running"
    echo "Tunnel logs: /tmp/tunnel.log"
    echo "Tunnel configuration: $HOME/.cloudflared/config.yml"
else
    echo "Tunnel is not running"
fi
EOF
chmod +x "$HOME/tunnel-status.sh"

log_message "Management scripts created in your home directory"

# Test configuration
log_message "Testing tunnel configuration..."
if cloudflared tunnel ingress validate; then
    log_message "Tunnel configuration is valid"
else
    log_error "Tunnel configuration is invalid. Please check $HOME/.cloudflared/config.yml"
    exit 1
fi

# Start tunnel
log_message "Starting tunnel..."
"$HOME/start-tunnel.sh"
log_message "Tunnel started"

# Generate client configuration
log_message "Generating client configuration..."
cat > "mcphub-cloudflare-config.json" <<EOF
{
  "mcpServers": {
    "MCPhub": {
      "type": "sse",
      "url": "https://$DOMAIN/sse",
      "keepAliveInterval": 60000,
      "owner": "admin"
    }
  }
}
EOF

log_message "Client configuration generated at mcphub-cloudflare-config.json"

# Final instructions
log_message "Cloudflare Tunnel setup complete!"
log_message "Your MCPhub instance is now accessible at https://$DOMAIN"
log_message ""
log_message "Management commands:"
log_message "  - Start tunnel: ~/start-tunnel.sh"
log_message "  - Stop tunnel: ~/stop-tunnel.sh"
log_message "  - Check status: ~/tunnel-status.sh"
log_message ""
log_message "Client configuration is available in mcphub-cloudflare-config.json"
log_message "Use this configuration in your MCP client to connect to MCPhub"

