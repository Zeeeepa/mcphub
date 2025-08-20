#!/bin/bash
# Cloudflare Tunnel Setup Script for MCPHub
# This script automates the process of setting up a Cloudflare Tunnel to expose your local MCP server
# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
# Load environment variables
if [ -f .env ]; then
    echo -e "${BLUE}Loading environment variables from .env file...${NC}"
    export $(grep -v '^#' .env | xargs)
else
    echo -e "${YELLOW}No .env file found. Make sure to set the required environment variables manually.${NC}"
fi
# Check for required environment variables
if [ -z "$CLOUDFLARE_EMAIL" ] || [ -z "$CLOUDFLARE_API_KEY" ] || [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo -e "${RED}Error: Required Cloudflare credentials are missing.${NC}"
    echo -e "${YELLOW}Please make sure the following environment variables are set:${NC}"
    echo -e "  - CLOUDFLARE_EMAIL"
    echo -e "  - CLOUDFLARE_API_KEY"
    echo -e "  - CLOUDFLARE_ACCOUNT_ID"
    exit 1
fi
# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo -e "${YELLOW}cloudflared not found. Installing...${NC}"
    
    # Detect OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt-get &> /dev/null; then
            # Debian/Ubuntu
            curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
            sudo dpkg -i cloudflared.deb
            rm cloudflared.deb
        elif command -v yum &> /dev/null; then
            # CentOS/RHEL
            curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-x86_64.rpm -o cloudflared.rpm
            sudo rpm -i cloudflared.rpm
            rm cloudflared.rpm
        else
            # Generic Linux
            curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
            chmod +x cloudflared
            sudo mv cloudflared /usr/local/bin/
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
# Create directories
mkdir -p /etc/cloudflared
mkdir -p /var/log
# Authenticate with Cloudflare
echo -e "${BLUE}Authenticating with Cloudflare...${NC}"
cloudflared tunnel login
# Create a new tunnel
echo -e "${BLUE}Creating a new Cloudflare Tunnel...${NC}"
TUNNEL_NAME="mcphub-tunnel-$(date +%s)"
TUNNEL_JSON=$(cloudflared tunnel create $TUNNEL_NAME)
TUNNEL_ID=$(echo $TUNNEL_JSON | grep -oP '(?<=Created tunnel )([a-z0-9-]+)')
if [ -z "$TUNNEL_ID" ]; then
    echo -e "${RED}Error: Failed to create tunnel.${NC}"
    exit 1
fi
echo -e "${GREEN}Successfully created tunnel with ID: $TUNNEL_ID${NC}"
# Update the config file with the tunnel ID
echo -e "${BLUE}Updating configuration file...${NC}"
sed -i "s/YOUR_TUNNEL_ID/$TUNNEL_ID/g" cloudflare-tunnel/config.yml
# Copy the config file to the cloudflared directory
echo -e "${BLUE}Copying configuration file...${NC}"
sudo cp cloudflare-tunnel/config.yml /etc/cloudflared/config.yml
# Create DNS records
echo -e "${BLUE}Creating DNS records...${NC}"
# Create DNS record for the worker subdomain
if [ ! -z "$CLOUDFLARE_WORKER_URL" ]; then
    WORKER_HOSTNAME=$(echo $CLOUDFLARE_WORKER_URL | sed 's/https:\/\///')
    echo -e "${BLUE}Creating DNS record for $WORKER_HOSTNAME...${NC}"
    cloudflared tunnel route dns $TUNNEL_ID $WORKER_HOSTNAME
fi
# Create DNS record for the custom domain if provided
if [ ! -z "$DOMAIN" ]; then
    CUSTOM_HOSTNAME="mcp.$DOMAIN"
    echo -e "${BLUE}Creating DNS record for $CUSTOM_HOSTNAME...${NC}"
    cloudflared tunnel route dns $TUNNEL_ID $CUSTOM_HOSTNAME
fi
# Start the tunnel
echo -e "${GREEN}Setup complete! Starting the tunnel...${NC}"
echo -e "${YELLOW}To run the tunnel in the background, use:${NC}"
echo -e "  cloudflared tunnel run $TUNNEL_ID"
echo -e "${YELLOW}To install as a service, use:${NC}"
echo -e "  sudo cloudflared service install"
# Start the tunnel
cloudflared tunnel run $TUNNEL_ID

