#!/bin/bash
# Cloudflare Tunnel Installation Script for MCPHub
# This script installs cloudflared as a system service for persistent operation
# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root.${NC}"
    echo -e "${YELLOW}Please run with sudo:${NC} sudo $0"
    exit 1
fi
# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}Error: cloudflared is not installed.${NC}"
    echo -e "${YELLOW}Please run the setup.sh script first.${NC}"
    exit 1
fi
# Check if config file exists
if [ ! -f "/etc/cloudflared/config.yml" ]; then
    echo -e "${RED}Error: Configuration file not found.${NC}"
    echo -e "${YELLOW}Please run the setup.sh script first.${NC}"
    exit 1
fi
# Get tunnel ID from config file
TUNNEL_ID=$(grep -oP '(?<=tunnel: )([a-z0-9-]+)' /etc/cloudflared/config.yml)
if [ -z "$TUNNEL_ID" ]; then
    echo -e "${RED}Error: Could not find tunnel ID in config file.${NC}"
    exit 1
fi
echo -e "${BLUE}Installing Cloudflare Tunnel as a system service...${NC}"
# Install the service
cloudflared service install
# Enable and start the service
if command -v systemctl &> /dev/null; then
    # systemd
    systemctl enable cloudflared
    systemctl start cloudflared
    
    # Check service status
    if systemctl is-active --quiet cloudflared; then
        echo -e "${GREEN}Cloudflare Tunnel service is running.${NC}"
    else
        echo -e "${RED}Error: Cloudflare Tunnel service failed to start.${NC}"
        echo -e "${YELLOW}Check the logs with:${NC} journalctl -u cloudflared"
        exit 1
    fi
elif command -v service &> /dev/null; then
    # init.d
    service cloudflared start
    
    # Check service status
    if service cloudflared status | grep -q "running"; then
        echo -e "${GREEN}Cloudflare Tunnel service is running.${NC}"
    else
        echo -e "${RED}Error: Cloudflare Tunnel service failed to start.${NC}"
        echo -e "${YELLOW}Check the logs in /var/log/cloudflared.log${NC}"
        exit 1
    fi
else
    echo -e "${RED}Error: Could not find systemctl or service command.${NC}"
    echo -e "${YELLOW}Please start the tunnel manually:${NC} cloudflared tunnel run $TUNNEL_ID"
    exit 1
fi
echo -e "${GREEN}Installation complete!${NC}"
echo -e "${BLUE}Your local MCP server is now accessible through Cloudflare Tunnel.${NC}"
echo -e "${YELLOW}To check the service status:${NC} systemctl status cloudflared"
echo -e "${YELLOW}To view logs:${NC} journalctl -u cloudflared"

