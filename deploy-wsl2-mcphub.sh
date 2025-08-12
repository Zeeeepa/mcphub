#!/bin/bash

#########################################
# WSL2 MCPhub Deployment Script
# Complete setup for MCPhub with PostgreSQL, Cloudflare Tunnel, and API Key Auth
# Adapted from the VPS hardening script for WSL2 environment
#########################################

set -uo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration variables
DOMAIN=${DOMAIN:-"pixeliumperfecto.co.uk"}
ENABLE_CLOUDFLARE_TUNNEL=${ENABLE_CLOUDFLARE_TUNNEL:-"yes"}
DB_NAME="mcphub"
DB_USER="mcphub_user"
# Generate a safe password without problematic characters
DB_PASS=$(head /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 20)
MCPHUB_PORT=3000
TUNNEL_NAME="mcphub-wsl2"

# Paths
APP_DIR="/home/$USER/mcphub"
LOG_FILE="/tmp/mcphub-wsl2-setup.log"

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
        log_warning "This script is optimized for WSL2. Some features may not work on other systems."
    else
        log_info "WSL2 environment detected"
    fi
}

log_message "Starting MCPhub WSL2 Setup & Deployment..."
log_message "Domain: $DOMAIN"
log_message "MCPhub Port: $MCPHUB_PORT"

# Set non-interactive mode
export DEBIAN_FRONTEND=noninteractive

#########################################
# PART 1: SYSTEM UPDATES (WSL2 Optimized)
#########################################

log_message "=== PART 1: SYSTEM UPDATES ==="

# System Updates
log_message "Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y -q
sudo apt-get autoremove -y
sudo apt-get autoclean -y

# Install essential packages
log_message "Installing essential packages..."
sudo apt-get install -y -q curl wget git build-essential software-properties-common

#########################################
# PART 2: DATABASE SETUP
#########################################

log_message "=== PART 2: DATABASE SETUP ==="

# Install PostgreSQL
log_message "Installing PostgreSQL..."
sudo apt-get install -y -q postgresql postgresql-contrib

# Start PostgreSQL (WSL2 may need manual start)
sudo service postgresql start

# Wait for PostgreSQL to be ready
sleep 5

# Create database and user
log_message "Setting up PostgreSQL database..."
sudo -u postgres psql <<EOSQL
CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASS';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
ALTER DATABASE $DB_NAME SET timezone TO 'UTC';
\q
EOSQL

# Configure PostgreSQL for local connections
PG_VERSION=$(sudo -u postgres psql -t -c "SELECT version();" | awk '{print $3}' | sed 's/\..*//')
PG_CONFIG="/etc/postgresql/$PG_VERSION/main/postgresql.conf"
if [ -f "$PG_CONFIG" ]; then
    sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" "$PG_CONFIG"
fi

# Update pg_hba.conf to trust local connections for the app user
PG_HBA="/etc/postgresql/$PG_VERSION/main/pg_hba.conf"
if [ -f "$PG_HBA" ]; then
    echo "host    $DB_NAME    $DB_USER    127.0.0.1/32    md5" | sudo tee -a "$PG_HBA"
fi

# Restart PostgreSQL
sudo service postgresql restart

log_message "PostgreSQL setup complete"

#########################################
# PART 3: NODE.JS & PM2 SETUP
#########################################

log_message "=== PART 3: NODE.JS & PM2 SETUP ==="

# Install Node.js LTS
log_message "Installing Node.js LTS..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
log_message "Installing PM2..."
sudo npm install -g pm2

log_message "Node.js and PM2 setup complete"

#########################################
# PART 4: MCPHUB SETUP
#########################################

log_message "=== PART 4: MCPHUB SETUP ==="

# Clone MCPhub
log_message "Cloning MCPhub repository..."
if [ -d "$APP_DIR" ]; then
    log_info "MCPhub directory already exists, updating..."
    cd "$APP_DIR"
    git pull
else
    git clone https://github.com/samanhappy/mcphub.git "$APP_DIR"
    cd "$APP_DIR"
fi

# Install dependencies
log_message "Installing MCPhub dependencies..."
npm install

# Create environment file
log_message "Creating environment configuration..."
cat > .env <<EOFILE
# Database Configuration
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASS=$DB_PASS
DB_HOST=localhost
DB_PORT=5432

# Application Configuration
NODE_ENV=production
PORT=$MCPHUB_PORT
BASE_PATH=

# Security
JWT_SECRET=$(openssl rand -hex 32)

# Cloudflare Configuration
DOMAIN=$DOMAIN
TUNNEL_NAME=$TUNNEL_NAME
EOFILE

# Create database-backed configuration
log_message "Setting up database-backed configuration..."

# Copy our enhanced files to MCPhub
cp database/migrations/001_initial_schema.sql "$APP_DIR/database/migrations/" 2>/dev/null || {
    mkdir -p "$APP_DIR/database/migrations"
    cp database/migrations/001_initial_schema.sql "$APP_DIR/database/migrations/"
}

cp database/seeds/default_data.sql "$APP_DIR/database/seeds/" 2>/dev/null || {
    mkdir -p "$APP_DIR/database/seeds"
    cp database/seeds/default_data.sql "$APP_DIR/database/seeds/"
}

cp src/services/databaseService.ts "$APP_DIR/src/services/" 2>/dev/null || {
    log_warning "Could not copy database service. You may need to implement database backend manually."
}

cp src/config/database.ts "$APP_DIR/src/config/" 2>/dev/null || {
    log_warning "Could not copy database config. You may need to implement database backend manually."
}

cp src/middlewares/enhancedAuth.ts "$APP_DIR/src/middlewares/" 2>/dev/null || {
    log_warning "Could not copy enhanced auth middleware. You may need to implement API key auth manually."
}

# Install additional dependencies for database support
log_message "Installing additional dependencies..."
npm install pg bcrypt @types/pg @types/bcrypt

# Create initial MCPhub configuration with database backend
log_message "Creating initial MCPhub configuration..."
cat > mcp_settings.json <<EOCONFIG
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "env": {},
      "enabled": true,
      "owner": "admin"
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"],
      "env": {},
      "enabled": true,
      "owner": "admin"
    }
  },
  "systemConfig": {
    "routing": {
      "enableGlobalRoute": true,
      "enableGroupNameRoute": true,
      "enableBearerAuth": true,
      "bearerAuthKey": "$(openssl rand -hex 32)",
      "skipAuth": false
    },
    "install": {
      "pythonIndexUrl": "",
      "npmRegistry": "",
      "baseUrl": "https://$DOMAIN"
    },
    "cloudflare": {
      "tunnelEnabled": true,
      "tunnelName": "$TUNNEL_NAME",
      "domain": "$DOMAIN"
    }
  },
  "users": [
    {
      "username": "admin",
      "password": "\$2b\$10\$Vt7krIvjNgyN67LXqly0uOcTpN0LI55cYRbcKC71pUDAP0nJ7RPa.",
      "isAdmin": true
    }
  ]
}
EOCONFIG

# Build MCPhub
log_message "Building MCPhub..."
npm run build

log_message "MCPhub setup complete"

#########################################
# PART 5: PM2 PROCESS MANAGEMENT
#########################################

log_message "=== PART 5: PM2 PROCESS MANAGEMENT ==="

# Create PM2 ecosystem file
cat > ecosystem.config.js <<EOFILE
module.exports = {
  apps: [
    {
      name: 'mcphub',
      script: 'npm',
      args: 'start',
      cwd: '$APP_DIR',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: $MCPHUB_PORT,
        DB_NAME: '$DB_NAME',
        DB_USER: '$DB_USER',
        DB_PASS: '$DB_PASS',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DOMAIN: '$DOMAIN'
      },
      error_file: '/tmp/mcphub-error.log',
      out_file: '/tmp/mcphub-out.log',
      log_file: '/tmp/mcphub-combined.log',
      time: true
    }
  ]
};
EOFILE

# Start MCPhub with PM2
log_message "Starting MCPhub with PM2..."
pm2 start ecosystem.config.js
pm2 save

# Create PM2 startup script for WSL2
log_message "Creating PM2 startup configuration..."
pm2 startup | grep -E '^sudo' | bash || log_warning "PM2 startup configuration may need manual setup"

log_message "PM2 process management setup complete"

#########################################
# PART 6: CLOUDFLARE TUNNEL SETUP
#########################################

if [ "$ENABLE_CLOUDFLARE_TUNNEL" = "yes" ]; then
    log_message "=== PART 6: CLOUDFLARE TUNNEL SETUP ==="
    
    # Make the Cloudflare tunnel setup script executable and run it
    chmod +x scripts/setup-cloudflare-tunnel.sh
    
    # Export variables for the tunnel script
    export DOMAIN
    export TUNNEL_NAME
    export MCPHUB_PORT
    export TEST_TUNNEL="no"  # Skip testing for now
    
    log_message "Running Cloudflare Tunnel setup..."
    ./scripts/setup-cloudflare-tunnel.sh
    
    log_message "Cloudflare Tunnel setup complete"
else
    log_message "Cloudflare Tunnel setup skipped"
fi

#########################################
# PART 7: NGINX SETUP (Optional)
#########################################

log_message "=== PART 7: NGINX SETUP (Optional) ==="

# Install Nginx for local reverse proxy (optional, useful for development)
log_message "Installing Nginx for local development..."
sudo apt-get install -y -q nginx

# Configure Nginx for MCPhub
log_message "Configuring Nginx for MCPhub..."
sudo tee /etc/nginx/sites-available/mcphub > /dev/null <<EOCONFIG
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name localhost;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    location / {
        proxy_pass http://localhost:$MCPHUB_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Important for SSE connections
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;
    }
    
    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
    }
}
EOCONFIG

# Enable the site
sudo ln -sf /etc/nginx/sites-available/mcphub /etc/nginx/sites-enabled/default

# Test and start Nginx
sudo nginx -t && sudo service nginx start

log_message "Nginx setup complete"

#########################################
# PART 8: CREATE MANAGEMENT SCRIPTS
#########################################

log_message "=== PART 8: CREATING MANAGEMENT SCRIPTS ==="

# Create start script
cat > "$HOME/start-mcphub.sh" <<EOFILE
#!/bin/bash
echo "Starting MCPhub services..."

# Start PostgreSQL
sudo service postgresql start
echo "PostgreSQL started"

# Start Nginx
sudo service nginx start
echo "Nginx started"

# Start MCPhub with PM2
cd $APP_DIR
pm2 start ecosystem.config.js 2>/dev/null || pm2 restart mcphub
echo "MCPhub started with PM2"

# Start Cloudflare Tunnel (if enabled)
if [ "$ENABLE_CLOUDFLARE_TUNNEL" = "yes" ]; then
    if [ -f "$HOME/start-tunnel.sh" ]; then
        $HOME/start-tunnel.sh
        echo "Cloudflare Tunnel started"
    fi
fi

echo "All services started!"
echo "MCPhub Dashboard: http://localhost:$MCPHUB_PORT"
if [ "$ENABLE_CLOUDFLARE_TUNNEL" = "yes" ]; then
    echo "Public URL: https://$DOMAIN"
fi
EOFILE

# Create stop script
cat > "$HOME/stop-mcphub.sh" <<EOFILE
#!/bin/bash
echo "Stopping MCPhub services..."

# Stop Cloudflare Tunnel
if [ -f "$HOME/stop-tunnel.sh" ]; then
    $HOME/stop-tunnel.sh
    echo "Cloudflare Tunnel stopped"
fi

# Stop MCPhub
pm2 stop mcphub 2>/dev/null || echo "MCPhub was not running"
echo "MCPhub stopped"

# Stop Nginx
sudo service nginx stop
echo "Nginx stopped"

# Note: We don't stop PostgreSQL as other services might be using it

echo "MCPhub services stopped!"
EOFILE

# Create status script
cat > "$HOME/mcphub-status.sh" <<EOFILE
#!/bin/bash
echo "MCPhub Service Status:"
echo "====================="

# Check PostgreSQL
if sudo service postgresql status > /dev/null 2>&1; then
    echo "✅ PostgreSQL: Running"
else
    echo "❌ PostgreSQL: Stopped"
fi

# Check Nginx
if sudo service nginx status > /dev/null 2>&1; then
    echo "✅ Nginx: Running"
else
    echo "❌ Nginx: Stopped"
fi

# Check MCPhub
if pm2 list | grep -q "mcphub.*online"; then
    echo "✅ MCPhub: Running"
else
    echo "❌ MCPhub: Stopped"
fi

# Check Cloudflare Tunnel
if [ -f "$HOME/tunnel-status.sh" ]; then
    echo ""
    echo "Cloudflare Tunnel Status:"
    $HOME/tunnel-status.sh
fi

echo ""
echo "Recent MCPhub logs:"
pm2 logs mcphub --lines 5 --nostream 2>/dev/null || echo "No logs available"
EOFILE

# Create API key generator script
cat > "$HOME/generate-api-key.sh" <<EOFILE
#!/bin/bash
echo "MCPhub API Key Generator"
echo "======================="

# Generate a secure API key
API_KEY=\$(openssl rand -hex 32)
echo "Generated API Key: \$API_KEY"
echo ""
echo "Add this to your MCP client configuration:"
echo ""
cat <<EOF
{
  "mcpServers": {
    "MCPhub": {
      "type": "sse",
      "url": "https://$DOMAIN/sse",
      "keepAliveInterval": 60000,
      "owner": "admin",
      "env": "\$API_KEY"
    }
  }
}
EOF
echo ""
echo "⚠️  IMPORTANT: Save this API key securely. You'll need to add it to MCPhub's database."
echo "   You can do this through the MCPhub web interface or by updating the database directly."
EOFILE

chmod +x "$HOME/start-mcphub.sh" "$HOME/stop-mcphub.sh" "$HOME/mcphub-status.sh" "$HOME/generate-api-key.sh"

log_message "Management scripts created"

#########################################
# PART 9: WINDOWS INTEGRATION
#########################################

log_message "=== PART 9: WINDOWS INTEGRATION ==="

# Create Windows batch file for easy startup
windows_user=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r\n' || echo "User")
startup_dir="/mnt/c/Users/$windows_user/Desktop"

if [ -d "$startup_dir" ]; then
    cat > "$startup_dir/Start-MCPhub.bat" <<EOFILE
@echo off
echo Starting MCPhub on WSL2...
wsl -d Ubuntu -u $USER -- bash -c "~/start-mcphub.sh"
echo.
echo MCPhub is starting up...
echo Dashboard: http://localhost:$MCPHUB_PORT
if [ "$ENABLE_CLOUDFLARE_TUNNEL" = "yes" ]; then
echo Public URL: https://$DOMAIN
fi
echo.
pause
EOFILE

    cat > "$startup_dir/Stop-MCPhub.bat" <<EOFILE
@echo off
echo Stopping MCPhub on WSL2...
wsl -d Ubuntu -u $USER -- bash -c "~/stop-mcphub.sh"
echo.
echo MCPhub services stopped.
pause
EOFILE

    cat > "$startup_dir/MCPhub-Status.bat" <<EOFILE
@echo off
echo MCPhub Status on WSL2...
wsl -d Ubuntu -u $USER -- bash -c "~/mcphub-status.sh"
echo.
pause
EOFILE

    log_message "Windows batch files created on Desktop"
else
    log_warning "Could not create Windows batch files. Desktop directory not found."
fi

#########################################
# FINAL SUMMARY
#########################################

# Wait for services to start
sleep 5

# Check service status
MCPHUB_STATUS=$(pm2 list | grep -c "online" || echo "0")
PG_STATUS=$(sudo service postgresql status > /dev/null 2>&1 && echo "running" || echo "stopped")
NGINX_STATUS=$(sudo service nginx status > /dev/null 2>&1 && echo "running" || echo "stopped")

echo ""
log_message "========================================="
log_message "🎉 MCPHUB WSL2 SETUP COMPLETE! 🎉"
log_message "========================================="
echo ""

log_info "📊 SERVICE STATUS:"
log_message "✅ Database: PostgreSQL ($PG_STATUS)"
log_message "✅ Web Server: Nginx ($NGINX_STATUS)"
log_message "✅ MCPhub: PM2 managed ($MCPHUB_STATUS process online)"
if [ "$ENABLE_CLOUDFLARE_TUNNEL" = "yes" ]; then
    log_message "✅ Cloudflare Tunnel: Configured for $DOMAIN"
else
    log_message "⚠️  Cloudflare Tunnel: Not configured"
fi
echo ""

log_info "🔑 DATABASE CREDENTIALS (SAVE THESE!):"
log_message "Database: $DB_NAME"
log_message "Username: $DB_USER"
log_message "Password: $DB_PASS"
log_message "Host: localhost"
log_message "Port: 5432"
log_message "Connection: postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
echo ""

log_info "📁 APPLICATION LOCATIONS:"
log_message "MCPhub Directory: $APP_DIR"
log_message "Configuration: $APP_DIR/mcp_settings.json"
log_message "Environment: $APP_DIR/.env"
log_message "PM2 Config: $APP_DIR/ecosystem.config.js"
echo ""

log_info "🔧 MANAGEMENT COMMANDS:"
log_message "Start all services: ~/start-mcphub.sh"
log_message "Stop all services: ~/stop-mcphub.sh"
log_message "Check status: ~/mcphub-status.sh"
log_message "Generate API key: ~/generate-api-key.sh"
log_message "PM2 commands: pm2 list, pm2 logs mcphub, pm2 restart mcphub"
echo ""

log_info "🌐 ACCESS URLS:"
log_message "Local Dashboard: http://localhost:$MCPHUB_PORT"
log_message "Local API: http://localhost:$MCPHUB_PORT/api"
if [ "$ENABLE_CLOUDFLARE_TUNNEL" = "yes" ]; then
    log_message "Public Dashboard: https://$DOMAIN"
    log_message "Public API: https://$DOMAIN/api"
    log_message "MCP Endpoint: https://$DOMAIN/sse"
else
    log_message "MCP Endpoint: http://localhost:$MCPHUB_PORT/sse"
fi
echo ""

log_info "🔑 CLIENT CONFIGURATION:"
log_message "Use this configuration in your MCP client:"
echo ""
if [ "$ENABLE_CLOUDFLARE_TUNNEL" = "yes" ]; then
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
else
cat <<EOF
{
  "mcpServers": {
    "MCPhub": {
      "type": "sse",
      "url": "http://localhost:$MCPHUB_PORT/sse",
      "keepAliveInterval": 60000,
      "owner": "admin",
      "env": "YOUR_API_KEY_HERE"
    }
  }
}
EOF
fi
echo ""

log_warning "⚠️ IMPORTANT NEXT STEPS:"
log_warning "1. Generate API Key: Run ~/generate-api-key.sh"
log_warning "2. Access Dashboard: Visit http://localhost:$MCPHUB_PORT"
log_warning "3. Default Login: admin / admin123 (change immediately!)"
if [ "$ENABLE_CLOUDFLARE_TUNNEL" = "yes" ]; then
    log_warning "4. Start Tunnel: Run ~/start-tunnel.sh"
    log_warning "5. Test Public Access: Visit https://$DOMAIN"
fi
log_warning "6. Configure MCP Servers: Add your MCP servers in the dashboard"
echo ""

log_info "📋 WINDOWS INTEGRATION:"
if [ -d "$startup_dir" ]; then
    log_message "✅ Windows batch files created on Desktop:"
    log_message "   - Start-MCPhub.bat"
    log_message "   - Stop-MCPhub.bat"
    log_message "   - MCPhub-Status.bat"
fi
echo ""

log_message "Setup log: $LOG_FILE"
log_message "MCPhub is ready for use!"

# Auto-start services
log_info "🚀 STARTING SERVICES..."
$HOME/start-mcphub.sh

echo ""
log_message "🎊 MCPhub is now running and ready to use!"

