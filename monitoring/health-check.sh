#!/bin/bash
# Health Check Script for MCPHub Cloudflare Integration
# This script checks the health of the Cloudflare Tunnel and MCP server
# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
# Load environment variables
if [ -f .env ]; then
    source .env
fi
# Log file
LOG_FILE="/var/log/mcphub-health.log"
ALERT_LOG="/var/log/mcphub-alerts.log"
# Create log directory if it doesn't exist
mkdir -p $(dirname $LOG_FILE)
mkdir -p $(dirname $ALERT_LOG)
# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> $LOG_FILE
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}
# Alert function
alert() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ALERT: $1" >> $ALERT_LOG
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ALERT: $1"
    
    # Send email alert if configured
    if [ ! -z "$ALERT_EMAIL" ]; then
        echo "MCPHub Health Alert: $1" | mail -s "MCPHub Health Alert" $ALERT_EMAIL
    fi
}
# Check if cloudflared is running
check_cloudflared() {
    if pgrep -x "cloudflared" > /dev/null; then
        log "Cloudflare Tunnel is running."
        return 0
    else
        alert "Cloudflare Tunnel is not running!"
        return 1
    fi
}
# Check if MCPHub is running
check_mcphub() {
    if curl -s http://localhost:3000/health > /dev/null; then
        log "MCPHub is running."
        return 0
    else
        alert "MCPHub is not running!"
        return 1
    fi
}
# Check if the public endpoint is accessible
check_public_endpoint() {
    # Check if we have a worker URL
    if [ ! -z "$CLOUDFLARE_WORKER_URL" ]; then
        if curl -s "$CLOUDFLARE_WORKER_URL/health" > /dev/null; then
            log "Public endpoint is accessible."
            return 0
        else
            alert "Public endpoint is not accessible!"
            return 1
        fi
    # Check if we have a domain
    elif [ ! -z "$DOMAIN" ]; then
        if curl -s "https://mcp.$DOMAIN/health" > /dev/null; then
            log "Public endpoint is accessible."
            return 0
        else
            alert "Public endpoint is not accessible!"
            return 1
        fi
    else
        log "No public endpoint configured. Skipping check."
        return 0
    fi
}
# Main health check
log "Starting health check..."
# Check cloudflared
check_cloudflared
CLOUDFLARED_STATUS=$?
# Check MCPHub
check_mcphub
MCPHUB_STATUS=$?
# Check public endpoint
check_public_endpoint
PUBLIC_STATUS=$?
# Overall status
if [ $CLOUDFLARED_STATUS -eq 0 ] && [ $MCPHUB_STATUS -eq 0 ] && [ $PUBLIC_STATUS -eq 0 ]; then
    log "All systems are healthy."
else
    alert "One or more systems are unhealthy. Check the logs for details."
    
    # Attempt to restart services if they're down
    if [ $CLOUDFLARED_STATUS -ne 0 ]; then
        log "Attempting to restart Cloudflare Tunnel..."
        if command -v systemctl &> /dev/null && systemctl is-active --quiet cloudflared; then
            sudo systemctl restart cloudflared
        elif [ -f /etc/init.d/cloudflared ]; then
            sudo service cloudflared restart
        else
            # Try to start cloudflared directly
            TUNNEL_ID=$(grep -oP '(?<=tunnel: )([a-z0-9-]+)' /etc/cloudflared/config.yml 2>/dev/null)
            if [ ! -z "$TUNNEL_ID" ]; then
                cloudflared tunnel run $TUNNEL_ID &
            fi
        fi
    fi
    
    if [ $MCPHUB_STATUS -ne 0 ]; then
        log "Attempting to restart MCPHub..."
        if command -v docker &> /dev/null && docker ps -q --filter "name=mcphub" &> /dev/null; then
            docker restart mcphub
        elif command -v pm2 &> /dev/null; then
            pm2 restart mcphub
        fi
    fi
fi
log "Health check completed."

