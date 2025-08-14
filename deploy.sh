#!/bin/bash
# Master Deployment Script for MCPHub with Cloudflare Integration
# This script orchestrates the entire deployment process
# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}Warning: Some operations may require root privileges.${NC}"
    echo -e "${YELLOW}Consider running with sudo if you encounter permission issues.${NC}"
fi
# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${BLUE}Creating .env file from .env.example...${NC}"
    cp .env.example .env
    
    # Prompt for Cloudflare credentials
    echo -e "${YELLOW}Please enter your Cloudflare credentials:${NC}"
    read -p "Cloudflare Email: " CF_EMAIL
    read -p "Cloudflare API Key: " CF_API_KEY
    read -p "Cloudflare Account ID: " CF_ACCOUNT_ID
    read -p "Domain (e.g., pixelium.uk, leave empty if none): " DOMAIN
    read -p "Cloudflare Worker Name (default: dashboard): " CF_WORKER_NAME
    CF_WORKER_NAME=${CF_WORKER_NAME:-dashboard}
    
    # Add Cloudflare credentials to .env
    echo "CLOUDFLARE_EMAIL=$CF_EMAIL" >> .env
    echo "CLOUDFLARE_API_KEY=$CF_API_KEY" >> .env
    echo "CLOUDFLARE_ACCOUNT_ID=$CF_ACCOUNT_ID" >> .env
    echo "CLOUDFLARE_WORKER_NAME=$CF_WORKER_NAME" >> .env
    
    if [ ! -z "$DOMAIN" ]; then
        echo "DOMAIN=$DOMAIN" >> .env
        echo "CLOUDFLARE_WORKER_URL=https://$CF_WORKER_NAME.$DOMAIN.workers.dev" >> .env
    fi
fi
# Load environment variables
echo -e "${BLUE}Loading environment variables...${NC}"
export $(grep -v '^#' .env | xargs)
# Make scripts executable
echo -e "${BLUE}Making scripts executable...${NC}"
chmod +x cloudflare-tunnel/setup.sh cloudflare-tunnel/install.sh cloudflare-worker/deploy.sh monitoring/health-check.sh
# Setup Cloudflare Tunnel
echo -e "${BLUE}Setting up Cloudflare Tunnel...${NC}"
./cloudflare-tunnel/setup.sh
# Install Cloudflare Tunnel as a service
echo -e "${BLUE}Installing Cloudflare Tunnel as a service...${NC}"
sudo ./cloudflare-tunnel/install.sh
# Deploy Cloudflare Worker
echo -e "${BLUE}Deploying Cloudflare Worker...${NC}"
./cloudflare-worker/deploy.sh
# Setup health check cron job
echo -e "${BLUE}Setting up health check cron job...${NC}"
(crontab -l 2>/dev/null | grep -v "health-check.sh"; echo "*/5 * * * * $(pwd)/monitoring/health-check.sh") | crontab -
# Final summary
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo -e "${BLUE}Your MCPHub server is now accessible at:${NC}"
if [ ! -z "$CLOUDFLARE_WORKER_URL" ]; then
    echo -e "  $CLOUDFLARE_WORKER_URL"
fi
if [ ! -z "$DOMAIN" ]; then
    echo -e "  https://mcp.$DOMAIN"
fi
echo -e "${YELLOW}To monitor the health of your deployment:${NC}"
echo -e "  - Check logs: ${NC}tail -f /var/log/mcphub-health.log"
echo -e "  - Check alerts: ${NC}tail -f /var/log/mcphub-alerts.log"
echo -e "${YELLOW}To restart the Cloudflare Tunnel:${NC}"
echo -e "  sudo systemctl restart cloudflared"
echo -e "${GREEN}Enjoy your globally accessible MCPHub server!${NC}"

