#!/bin/bash

#########################################
# Cloudflare Tunnel Setup Script for MCPhub
# Creates a secure tunnel to expose MCPhub to the internet
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
TUNNEL_NAME=${TUNNEL_NAME:-"mcphub-tunnel"}
LOCAL_PORT=${LOCAL_PORT:-3001}
EMAIL=${EMAIL:-"pixeliumperfecto@gmail.com"}

# Paths
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

# Create log file
touch "$LOG_FILE"
log_message "Starting Cloudflare Tunnel setup for MCPhub"

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    log_message "Installing cloudflared..."
    
    # Detect OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt-get &> /dev/null; then
            # Debian/Ubuntu
            curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
            sudo dpkg -i cloudflared.deb
            rm cloudflared.deb
        elif command -v yum &> /dev/null; then
            # RHEL/CentOS
            curl -L --output cloudflared.rpm https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-x86_64.rpm
            sudo yum localinstall -y cloudflared.rpm
            rm cloudflared.rpm
        else
            # Generic Linux
            curl -L --output cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
            chmod +x cloudflared
            sudo mv cloudflared /usr/local/bin/
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        brew install cloudflare/cloudflare/cloudflared
    else
        log_error "Unsupported OS: $OSTYPE"
        exit 1
    fi
    
    log_message "cloudflared installed successfully"
else
    log_info "cloudflared already installed: $(cloudflared --version)"
fi

# Authenticate with Cloudflare
log_message "Authenticating with Cloudflare..."
log_info "This will open a browser window. Please log in to your Cloudflare account."
log_info "If you're running this script on a headless server, you may need to copy the URL and open it in a browser on another device."

cloudflared tunnel login

log_message "Authentication successful"

# Create tunnel
log_message "Creating tunnel: $TUNNEL_NAME..."

# Check if tunnel already exists
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
    log_warning "Tunnel '$TUNNEL_NAME' already exists"
    
    # Get tunnel ID
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
    log_info "Using existing tunnel with ID: $TUNNEL_ID"
else
    # Create new tunnel
    TUNNEL_ID=$(cloudflared tunnel create "$TUNNEL_NAME" | grep -oP 'Created tunnel \K[a-z0-9-]+')
    log_message "Tunnel created with ID: $TUNNEL_ID"
fi

# Create config directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

# Create config file
log_message "Creating tunnel configuration..."

cat > "$CONFIG_DIR/config.yml" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CONFIG_DIR/$TUNNEL_ID.json

ingress:
  - hostname: $DOMAIN
    service: http://localhost:$LOCAL_PORT
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      keepAliveConnections: 10
      keepAliveTimeout: 90s
  
  - service: http_status:404

originRequest:
  http2Origin: false

logfile: /tmp/cloudflared.log
EOF

log_message "Tunnel configuration created at $CONFIG_DIR/config.yml"

# Route DNS
log_message "Setting up DNS routing..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN"

log_message "DNS routing configured for $DOMAIN"

# Generate client configuration
log_message "Generating client configuration..."

# Create client configuration
cat > mcphub-tunnel-config.json <<EOF
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

log_message "Client configuration generated at mcphub-tunnel-config.json"

# Start tunnel
log_message "Starting tunnel..."
log_info "The tunnel will run in the foreground. Press Ctrl+C to stop it."
log_info "To run the tunnel in the background, use 'cloudflared service install' to install it as a service."

# Instructions for running as a service
log_message "To install as a service, run:"
log_info "sudo cloudflared service install"
log_info "sudo systemctl start cloudflared"

# Final instructions
log_message "Cloudflare Tunnel setup complete!"
log_message "Your MCPhub instance is now accessible at https://$DOMAIN"
log_message ""
log_message "Client configuration is available in mcphub-tunnel-config.json"
log_message "Use this configuration in your MCP client to connect to MCPhub"

# Start the tunnel
cloudflared tunnel run

