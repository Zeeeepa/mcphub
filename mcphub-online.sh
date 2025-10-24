#!/bin/bash
# MCPHub Online - Simplified Deployment Script
# This script provides a streamlined way to expose your MCPHub server to the internet
# using Cloudflare Tunnel with minimal configuration and dependencies.

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
MCP_PORT=3000
CONFIG_DIR="$HOME/.mcphub-online"
LOG_DIR="/var/log/mcphub-online"
TUNNEL_NAME="mcphub-tunnel"
CREDENTIALS_FILE="$CONFIG_DIR/credentials.json"
CONFIG_FILE="$CONFIG_DIR/config.yml"
ENV_FILE="$CONFIG_DIR/.env"
LOG_FILE="$LOG_DIR/cloudflared.log"
HEALTH_CHECK_FILE="$CONFIG_DIR/health-check.sh"
SYSTEMD_SERVICE_FILE="/etc/systemd/system/mcphub-tunnel.service"

# Function to print usage
usage() {
    echo "MCPHub Online - Expose your MCPHub server to the internet"
    echo ""
    echo "Usage: $0 [options] [command]"
    echo ""
    echo "Commands:"
    echo "  setup       Setup Cloudflare Tunnel (first-time setup)"
    echo "  start       Start the tunnel"
    echo "  stop        Stop the tunnel"
    echo "  status      Check tunnel status"
    echo "  logs        View tunnel logs"
    echo "  install     Install as a system service"
    echo "  uninstall   Uninstall the system service"
    echo ""
    echo "Options:"
    echo "  -p, --port PORT       MCPHub server port (default: 3000)"
    echo "  -d, --domain DOMAIN   Custom domain to use (e.g., example.com)"
    echo "  -s, --subdomain SUB   Subdomain to use (default: mcp)"
    echo "  -h, --help            Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 setup --domain example.com"
    echo "  $0 start"
    echo ""
}

# Function to check if cloudflared is installed
check_cloudflared() {
    if ! command -v cloudflared &> /dev/null; then
        echo -e "${YELLOW}cloudflared not found. Installing...${NC}"
        
        # Detect OS
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            # Linux
            if command -v apt-get &> /dev/null; then
                # Debian/Ubuntu
                curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
                sudo dpkg -i /tmp/cloudflared.deb
                rm /tmp/cloudflared.deb
            elif command -v yum &> /dev/null; then
                # CentOS/RHEL
                curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-x86_64.rpm -o /tmp/cloudflared.rpm
                sudo rpm -i /tmp/cloudflared.rpm
                rm /tmp/cloudflared.rpm
            else
                # Generic Linux
                curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
                chmod +x /tmp/cloudflared
                sudo mv /tmp/cloudflared /usr/local/bin/
            fi
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            if command -v brew &> /dev/null; then
                brew install cloudflare/cloudflare/cloudflared
            else
                echo -e "${RED}Error: Homebrew not found. Please install Homebrew or cloudflared manually.${NC}"
                echo -e "${YELLOW}Visit: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/${NC}"
                exit 1
            fi
        else
            echo -e "${RED}Error: Unsupported operating system.${NC}"
            echo -e "${YELLOW}Please install cloudflared manually:${NC}"
            echo -e "${YELLOW}Visit: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/${NC}"
            exit 1
        fi
    fi
    echo -e "${GREEN}cloudflared is installed.${NC}"
}

# Function to create directories
create_directories() {
    mkdir -p "$CONFIG_DIR"
    sudo mkdir -p "$LOG_DIR"
    sudo chown $(whoami) "$LOG_DIR" || true
}

# Function to setup Cloudflare Tunnel
setup_tunnel() {
    echo -e "${BLUE}Setting up Cloudflare Tunnel...${NC}"
    
    # Authenticate with Cloudflare
    echo -e "${BLUE}Authenticating with Cloudflare...${NC}"
    cloudflared tunnel login
    
    # Create a new tunnel
    echo -e "${BLUE}Creating a new Cloudflare Tunnel...${NC}"
    TUNNEL_JSON=$(cloudflared tunnel create "$TUNNEL_NAME-$(date +%s)")
    TUNNEL_ID=$(echo $TUNNEL_JSON | grep -oP '(?<=Created tunnel )([a-z0-9-]+)')
    
    if [ -z "$TUNNEL_ID" ]; then
        echo -e "${RED}Error: Failed to create tunnel.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Successfully created tunnel with ID: $TUNNEL_ID${NC}"
    
    # Save tunnel ID to environment file
    echo "TUNNEL_ID=$TUNNEL_ID" > "$ENV_FILE"
    echo "MCP_PORT=$MCP_PORT" >> "$ENV_FILE"
    echo "CREDENTIALS_FILE=$CREDENTIALS_FILE" >> "$ENV_FILE"
    echo "LOG_FILE=$LOG_FILE" >> "$ENV_FILE"
    
    # Create DNS record
    if [ ! -z "$DOMAIN" ]; then
        HOSTNAME="${SUBDOMAIN}.${DOMAIN}"
        echo -e "${BLUE}Creating DNS record for $HOSTNAME...${NC}"
        cloudflared tunnel route dns "$TUNNEL_ID" "$HOSTNAME"
        echo "MCP_HOSTNAME=$HOSTNAME" >> "$ENV_FILE"
    else
        # Use Cloudflare's auto-generated hostname
        HOSTNAME=$(cloudflared tunnel info "$TUNNEL_ID" | grep -oP '(?<=Hostname: )([a-z0-9.-]+\.trycloudflare\.com)')
        echo "MCP_HOSTNAME=$HOSTNAME" >> "$ENV_FILE"
    fi
    
    # Create config file
    echo -e "${BLUE}Creating configuration file...${NC}"
    envsubst < cloudflare-tunnel/simplified-config.yml > "$CONFIG_FILE"
    
    # Create health check script
    create_health_check
    
    echo -e "${GREEN}Setup complete!${NC}"
    echo -e "${BLUE}Your MCPHub server will be accessible at:${NC}"
    echo -e "  https://${HOSTNAME}"
    echo -e "${YELLOW}To start the tunnel, run:${NC}"
    echo -e "  $0 start"
    echo -e "${YELLOW}To install as a system service, run:${NC}"
    echo -e "  $0 install"
}

# Function to create health check script
create_health_check() {
    cat > "$HEALTH_CHECK_FILE" << 'EOF'
#!/bin/bash
# Health Check Script for MCPHub Online

# Load environment variables
if [ -f "$HOME/.mcphub-online/.env" ]; then
    source "$HOME/.mcphub-online/.env"
fi

# Log file
LOG_FILE="${LOG_FILE:-/var/log/mcphub-online/health.log}"
MCP_PORT="${MCP_PORT:-3000}"
MCP_HOSTNAME="${MCP_HOSTNAME:-localhost}"

# Create log directory if it doesn't exist
mkdir -p $(dirname "$LOG_FILE")

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Check if cloudflared is running
if ! pgrep -x "cloudflared" > /dev/null; then
    log "Cloudflare Tunnel is not running! Attempting to restart..."
    
    # Try to restart the service
    if command -v systemctl &> /dev/null && systemctl is-enabled --quiet mcphub-tunnel; then
        systemctl restart mcphub-tunnel
        log "Restarted mcphub-tunnel service"
    else
        # Try to start manually
        nohup cloudflared tunnel run --config "$HOME/.mcphub-online/config.yml" > /dev/null 2>&1 &
        log "Started cloudflared manually"
    fi
else
    log "Cloudflare Tunnel is running"
fi

# Check if MCPHub is running
if ! curl -s "http://localhost:$MCP_PORT/health" > /dev/null; then
    log "MCPHub is not running!"
else
    log "MCPHub is running"
fi

# Check if the public endpoint is accessible
if [ ! -z "$MCP_HOSTNAME" ]; then
    if ! curl -s "https://$MCP_HOSTNAME/health" > /dev/null; then
        log "Public endpoint is not accessible!"
    else
        log "Public endpoint is accessible"
    fi
fi
EOF

    chmod +x "$HEALTH_CHECK_FILE"
    
    # Setup cron job for health check
    (crontab -l 2>/dev/null | grep -v "$HEALTH_CHECK_FILE"; echo "*/5 * * * * $HEALTH_CHECK_FILE") | crontab -
}

# Function to start the tunnel
start_tunnel() {
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${RED}Error: Configuration not found. Please run setup first.${NC}"
        echo -e "${YELLOW}Run:${NC} $0 setup"
        exit 1
    fi
    
    source "$ENV_FILE"
    
    echo -e "${BLUE}Starting Cloudflare Tunnel...${NC}"
    cloudflared tunnel run --config "$CONFIG_FILE"
}

# Function to stop the tunnel
stop_tunnel() {
    echo -e "${BLUE}Stopping Cloudflare Tunnel...${NC}"
    pkill -f "cloudflared tunnel run"
    echo -e "${GREEN}Tunnel stopped.${NC}"
}

# Function to check tunnel status
check_status() {
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${RED}Error: Configuration not found. Please run setup first.${NC}"
        echo -e "${YELLOW}Run:${NC} $0 setup"
        exit 1
    fi
    
    source "$ENV_FILE"
    
    echo -e "${BLUE}Checking Cloudflare Tunnel status...${NC}"
    
    if pgrep -f "cloudflared tunnel run" > /dev/null; then
        echo -e "${GREEN}Tunnel is running.${NC}"
        echo -e "${BLUE}Your MCPHub server is accessible at:${NC}"
        echo -e "  https://${MCP_HOSTNAME}"
        
        # Check if MCPHub is running
        if curl -s "http://localhost:$MCP_PORT/health" > /dev/null; then
            echo -e "${GREEN}MCPHub is running.${NC}"
        else
            echo -e "${RED}MCPHub is not running!${NC}"
            echo -e "${YELLOW}Make sure MCPHub is running on port $MCP_PORT.${NC}"
        fi
    else
        echo -e "${RED}Tunnel is not running.${NC}"
        echo -e "${YELLOW}To start the tunnel, run:${NC} $0 start"
        
        # Check if installed as a service
        if [ -f "$SYSTEMD_SERVICE_FILE" ]; then
            echo -e "${YELLOW}Or start the service:${NC} sudo systemctl start mcphub-tunnel"
        fi
    fi
}

# Function to view logs
view_logs() {
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${RED}Error: Configuration not found. Please run setup first.${NC}"
        echo -e "${YELLOW}Run:${NC} $0 setup"
        exit 1
    fi
    
    source "$ENV_FILE"
    
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        echo -e "${RED}Error: Log file not found.${NC}"
        exit 1
    fi
}

# Function to install as a system service
install_service() {
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${RED}Error: Configuration not found. Please run setup first.${NC}"
        echo -e "${YELLOW}Run:${NC} $0 setup"
        exit 1
    fi
    
    source "$ENV_FILE"
    
    echo -e "${BLUE}Installing Cloudflare Tunnel as a system service...${NC}"
    
    # Create systemd service file
    cat > /tmp/mcphub-tunnel.service << EOF
[Unit]
Description=Cloudflare Tunnel for MCPHub
After=network.target

[Service]
Type=simple
User=$(whoami)
ExecStart=$(which cloudflared) tunnel run --config $CONFIG_FILE
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
    
    sudo mv /tmp/mcphub-tunnel.service "$SYSTEMD_SERVICE_FILE"
    
    # Reload systemd
    sudo systemctl daemon-reload
    
    # Enable and start the service
    sudo systemctl enable mcphub-tunnel
    sudo systemctl start mcphub-tunnel
    
    # Check service status
    if systemctl is-active --quiet mcphub-tunnel; then
        echo -e "${GREEN}Service installed and running.${NC}"
        echo -e "${BLUE}Your MCPHub server is accessible at:${NC}"
        echo -e "  https://${MCP_HOSTNAME}"
        echo -e "${YELLOW}To check service status:${NC} sudo systemctl status mcphub-tunnel"
        echo -e "${YELLOW}To view logs:${NC} sudo journalctl -u mcphub-tunnel -f"
    else
        echo -e "${RED}Error: Service failed to start.${NC}"
        echo -e "${YELLOW}Check logs:${NC} sudo journalctl -u mcphub-tunnel"
        exit 1
    fi
}

# Function to uninstall the service
uninstall_service() {
    echo -e "${BLUE}Uninstalling Cloudflare Tunnel service...${NC}"
    
    # Stop and disable the service
    sudo systemctl stop mcphub-tunnel 2>/dev/null || true
    sudo systemctl disable mcphub-tunnel 2>/dev/null || true
    
    # Remove service file
    sudo rm -f "$SYSTEMD_SERVICE_FILE"
    
    # Reload systemd
    sudo systemctl daemon-reload
    
    echo -e "${GREEN}Service uninstalled.${NC}"
}

# Parse command line arguments
COMMAND=""
while [[ $# -gt 0 ]]; do
    case $1 in
        setup|start|stop|status|logs|install|uninstall)
            COMMAND="$1"
            shift
            ;;
        -p|--port)
            MCP_PORT="$2"
            shift 2
            ;;
        -d|--domain)
            DOMAIN="$2"
            shift 2
            ;;
        -s|--subdomain)
            SUBDOMAIN="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Error: Unknown option $1${NC}"
            usage
            exit 1
            ;;
    esac
done

# Set default subdomain if not provided
SUBDOMAIN=${SUBDOMAIN:-mcp}

# Execute command
case "$COMMAND" in
    setup)
        check_cloudflared
        create_directories
        setup_tunnel
        ;;
    start)
        check_cloudflared
        start_tunnel
        ;;
    stop)
        stop_tunnel
        ;;
    status)
        check_status
        ;;
    logs)
        view_logs
        ;;
    install)
        check_cloudflared
        install_service
        ;;
    uninstall)
        uninstall_service
        ;;
    *)
        usage
        exit 1
        ;;
esac

exit 0

