# Cloudflare Tunnel Setup for MCPhub

This guide covers setting up Cloudflare Tunnel to make your WSL2 MCPhub instance accessible via your custom domain with SSL/TLS encryption.

## 🎯 Overview

Cloudflare Tunnel creates a secure, outbound-only connection from your WSL2 environment to Cloudflare's edge network, eliminating the need for:
- Port forwarding
- Dynamic DNS
- SSL certificate management
- Firewall configuration

## 📋 Prerequisites

- Cloudflare account with your domain configured
- Domain DNS managed by Cloudflare
- MCPhub running on WSL2
- Ubuntu/Debian WSL2 environment

## 🚀 Automated Setup

### Quick Setup Script

The deployment includes an automated Cloudflare Tunnel setup script:

```bash
# Run the automated setup
chmod +x scripts/setup-cloudflare-tunnel.sh
DOMAIN="pixeliumperfecto.co.uk" ./scripts/setup-cloudflare-tunnel.sh
```

### Manual Configuration

If you prefer manual setup or need custom configuration:

## 🔧 Manual Setup Steps

### 1. Install Cloudflared

```bash
# Download and install cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
sudo apt-get install -f -y  # Fix any dependency issues
```

### 2. Authenticate with Cloudflare

```bash
# This will open a browser for authentication
cloudflared tunnel login
```

Follow the browser prompts to:
1. Log in to your Cloudflare account
2. Select your domain
3. Authorize the tunnel

### 3. Create Tunnel

```bash
# Create a new tunnel
cloudflared tunnel create mcphub-wsl2

# List tunnels to verify creation
cloudflared tunnel list
```

### 4. Configure Tunnel

Create the tunnel configuration file:

```bash
# Create config directory
mkdir -p ~/.cloudflared

# Create configuration file
cat > ~/.cloudflared/config.yml <<EOF
tunnel: YOUR_TUNNEL_ID
credentials-file: ~/.cloudflared/YOUR_TUNNEL_ID.json

# Ingress rules - order matters!
ingress:
  # Main MCPhub application
  - hostname: pixeliumperfecto.co.uk
    service: http://localhost:3000
    originRequest:
      # Important for SSE connections
      noTLSVerify: true
      connectTimeout: 30s
      tlsTimeout: 30s
      tcpKeepAlive: 30s
      keepAliveConnections: 10
      keepAliveTimeout: 90s
      httpHostHeader: pixeliumperfecto.co.uk
  
  # API subdomain (optional)
  - hostname: api.pixeliumperfecto.co.uk
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
      httpHostHeader: api.pixeliumperfecto.co.uk
  
  # Health check endpoint
  - hostname: health.pixeliumperfecto.co.uk
    service: http://localhost:3000/health
  
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
```

### 5. Route DNS

```bash
# Route your domain to the tunnel
cloudflared tunnel route dns mcphub-wsl2 pixeliumperfecto.co.uk

# Route API subdomain (optional)
cloudflared tunnel route dns mcphub-wsl2 api.pixeliumperfecto.co.uk
```

### 6. Test Configuration

```bash
# Test the configuration
cloudflared tunnel ingress validate

# Run tunnel in foreground for testing
cloudflared tunnel --config ~/.cloudflared/config.yml run
```

## 🔄 Service Management

### Create Startup Scripts

The automated setup creates these management scripts:

```bash
# Start tunnel
~/start-tunnel.sh

# Stop tunnel
~/stop-tunnel.sh

# Check tunnel status
~/tunnel-status.sh
```

### Manual Service Creation

For systemd service (limited support in WSL2):

```bash
# Create systemd service file
sudo tee /etc/systemd/system/cloudflared-tunnel.service > /dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel for MCPhub
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=/usr/local/bin/cloudflared tunnel --config ~/.cloudflared/config.yml run
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable service (may not work in all WSL2 setups)
sudo systemctl enable cloudflared-tunnel.service
```

### Windows Startup Integration

Create Windows startup script:

```batch
@echo off
REM Save as mcphub-tunnel.bat in Windows Startup folder
echo Starting MCPhub Cloudflare Tunnel...
wsl -d Ubuntu -u your-username -- bash -c "cd ~ && cloudflared tunnel --config ~/.cloudflared/config.yml run > /tmp/tunnel.log 2>&1 &"
echo MCPhub tunnel started. Check /tmp/tunnel.log in WSL for logs.
```

## ⚙️ Configuration Options

### SSE Connection Optimization

For MCPhub's Server-Sent Events (SSE) connections:

```yaml
originRequest:
  # Disable HTTP/2 for better SSE compatibility
  http2Origin: false
  
  # Connection timeouts
  connectTimeout: 30s
  tlsTimeout: 30s
  tcpKeepAlive: 30s
  
  # Keep-alive settings for long-lived connections
  keepAliveConnections: 10
  keepAliveTimeout: 90s
  
  # Disable TLS verification for local connections
  noTLSVerify: true
```

### Multiple Subdomains

Configure multiple subdomains for different services:

```yaml
ingress:
  # Main application
  - hostname: mcphub.pixeliumperfecto.co.uk
    service: http://localhost:3000
  
  # API endpoint
  - hostname: api.pixeliumperfecto.co.uk
    service: http://localhost:3000/api
  
  # Admin interface
  - hostname: admin.pixeliumperfecto.co.uk
    service: http://localhost:3000/admin
  
  # WebSocket/SSE endpoint
  - hostname: ws.pixeliumperfecto.co.uk
    service: http://localhost:3000/sse
```

### Load Balancing

For high availability with multiple instances:

```yaml
ingress:
  - hostname: pixeliumperfecto.co.uk
    service: http://localhost:3000
    originRequest:
      # Load balancing configuration
      loadBalancer:
        - http://localhost:3000
        - http://localhost:3001
        - http://localhost:3002
```

## 🔒 Security Configuration

### Access Control

Restrict access to specific countries or IP ranges:

```yaml
# In Cloudflare dashboard, configure:
# - WAF rules for geographic restrictions
# - Rate limiting for API endpoints
# - Bot protection for automated requests
```

### SSL/TLS Settings

Configure SSL/TLS mode in Cloudflare dashboard:

1. **Flexible**: Cloudflare ↔ Visitor (HTTPS), Cloudflare ↔ Origin (HTTP)
2. **Full**: Cloudflare ↔ Visitor (HTTPS), Cloudflare ↔ Origin (HTTPS, self-signed OK)
3. **Full (Strict)**: Cloudflare ↔ Visitor (HTTPS), Cloudflare ↔ Origin (HTTPS, valid cert required)

For MCPhub, use **Full** mode since we're connecting to localhost.

### Authentication

Add Cloudflare Access for additional security:

```yaml
# Configure in Cloudflare dashboard:
# - Access policies for admin endpoints
# - Service tokens for API access
# - Identity provider integration
```

## 📊 Monitoring and Logging

### Tunnel Logs

```bash
# View real-time logs
tail -f /tmp/cloudflared.log

# View tunnel metrics
curl http://localhost:8080/metrics  # If metrics enabled
```

### Cloudflare Analytics

Monitor tunnel performance in Cloudflare dashboard:
- Traffic analytics
- Performance metrics
- Error rates
- Geographic distribution

### Health Checks

Configure health checks for automatic failover:

```yaml
ingress:
  - hostname: health.pixeliumperfecto.co.uk
    service: http://localhost:3000/health
```

## 🔧 Troubleshooting

### Common Issues

#### Tunnel Connection Fails
```bash
# Check tunnel status
cloudflared tunnel list

# Test configuration
cloudflared tunnel ingress validate

# Check credentials
ls -la ~/.cloudflared/
```

#### SSE Connections Drop
```yaml
# Ensure these settings in config.yml:
originRequest:
  http2Origin: false
  keepAliveConnections: 10
  keepAliveTimeout: 90s
```

#### DNS Not Resolving
```bash
# Check DNS routing
cloudflared tunnel route dns list

# Verify in Cloudflare dashboard
# DNS > Records should show CNAME record
```

#### High Latency
```yaml
# Optimize connection settings:
originRequest:
  connectTimeout: 10s
  tcpKeepAlive: 30s
  keepAliveConnections: 20
```

### Debug Commands

```bash
# Test tunnel connectivity
cloudflared tunnel --config ~/.cloudflared/config.yml run --loglevel debug

# Test specific hostname
curl -H "Host: pixeliumperfecto.co.uk" http://localhost:3000

# Check tunnel metrics
curl http://localhost:8080/metrics
```

## 🚀 Advanced Features

### Custom Headers

Add custom headers for enhanced functionality:

```yaml
ingress:
  - hostname: pixeliumperfecto.co.uk
    service: http://localhost:3000
    originRequest:
      httpHostHeader: pixeliumperfecto.co.uk
      originServerName: mcphub-server
```

### Path-Based Routing

Route different paths to different services:

```yaml
ingress:
  - hostname: pixeliumperfecto.co.uk
    path: /api/*
    service: http://localhost:3001
  
  - hostname: pixeliumperfecto.co.uk
    path: /admin/*
    service: http://localhost:3002
  
  - hostname: pixeliumperfecto.co.uk
    service: http://localhost:3000
```

### Backup Tunnels

Configure multiple tunnels for redundancy:

```bash
# Create backup tunnel
cloudflared tunnel create mcphub-backup

# Configure with same hostnames
# Cloudflare automatically load balances
```

## 📚 Additional Resources

- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Cloudflared Configuration Reference](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/local/local-management/configuration-file/)
- [Cloudflare Access Documentation](https://developers.cloudflare.com/cloudflare-one/applications/)
- [WSL2 Networking Guide](https://docs.microsoft.com/en-us/windows/wsl/networking)

## 🆘 Support

For Cloudflare Tunnel specific issues:
1. Check Cloudflare dashboard for tunnel status
2. Review tunnel logs: `tail -f /tmp/cloudflared.log`
3. Test configuration: `cloudflared tunnel ingress validate`
4. Contact Cloudflare support for tunnel-specific issues
5. Check MCPhub GitHub issues for integration problems

