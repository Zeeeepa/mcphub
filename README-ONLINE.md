# MCPHub Online: Simplified Deployment Guide

This guide provides a streamlined approach to expose your local MCPHub server to the internet using Cloudflare Tunnel. The solution is designed to be simple, secure, and reliable.

## Overview

MCPHub Online uses Cloudflare Tunnel to create a secure connection between your local MCPHub server and Cloudflare's edge network. This allows you to access your MCPHub server from anywhere without opening ports on your firewall or setting up complex networking.

### Features

- **Simple Setup**: One-command setup process
- **Secure Connection**: End-to-end encrypted tunnel
- **Automatic DNS**: Custom domain support with automatic DNS configuration
- **Health Monitoring**: Built-in health checks with automatic recovery
- **Systemd Integration**: Run as a system service for reliability
- **Docker Support**: Optional Docker Compose integration

## Quick Start

### Prerequisites

- A Cloudflare account (free tier is sufficient)
- MCPHub running locally on port 3000 (or specify a different port)
- Linux, macOS, or WSL on Windows

### Installation

1. Download the script:

```bash
curl -O https://raw.githubusercontent.com/Zeeeepa/mcphub/main/mcphub-online.sh
chmod +x mcphub-online.sh
```

2. Run the setup command:

```bash
# With default settings (auto-generated hostname)
./mcphub-online.sh setup

# With a custom domain (must be managed by Cloudflare)
./mcphub-online.sh setup --domain example.com --subdomain mcp
```

3. Start the tunnel:

```bash
./mcphub-online.sh start
```

4. (Optional) Install as a system service for automatic startup:

```bash
./mcphub-online.sh install
```

That's it! Your MCPHub server is now accessible at the URL provided during setup.

## Usage

The `mcphub-online.sh` script provides several commands:

```bash
# Show help
./mcphub-online.sh --help

# Setup the tunnel (first-time setup)
./mcphub-online.sh setup [options]

# Start the tunnel
./mcphub-online.sh start

# Stop the tunnel
./mcphub-online.sh stop

# Check tunnel status
./mcphub-online.sh status

# View tunnel logs
./mcphub-online.sh logs

# Install as a system service
./mcphub-online.sh install

# Uninstall the system service
./mcphub-online.sh uninstall
```

### Options

- `-p, --port PORT`: MCPHub server port (default: 3000)
- `-d, --domain DOMAIN`: Custom domain to use (e.g., example.com)
- `-s, --subdomain SUB`: Subdomain to use (default: mcp)

## Docker Integration

If you prefer to use Docker, a simplified Docker Compose configuration is provided:

1. Setup the tunnel first:

```bash
./mcphub-online.sh setup
```

2. Use the Docker Compose configuration:

```bash
docker-compose -f docker-compose.simplified.yml up -d
```

## How It Works

1. **Cloudflare Tunnel**: Creates a secure connection between your local MCPHub server and Cloudflare's edge network
2. **DNS Configuration**: Automatically configures DNS records for your domain or provides a free cloudflare.com subdomain
3. **Health Monitoring**: Periodically checks the health of the tunnel and MCPHub server, automatically recovering from failures
4. **Systemd Integration**: Runs as a system service for reliability and automatic startup

## Security Considerations

- All traffic is encrypted end-to-end between your server and Cloudflare's edge
- No ports need to be opened on your firewall
- Cloudflare provides additional security features like DDoS protection, rate limiting, and WAF
- Authentication can be added using Cloudflare Access (not included in this setup)

## Troubleshooting

### Tunnel Not Starting

Check the logs:

```bash
./mcphub-online.sh logs
```

Ensure MCPHub is running:

```bash
curl http://localhost:3000/health
```

### DNS Issues

If using a custom domain, ensure it's properly configured in Cloudflare:

1. Domain must be added to your Cloudflare account
2. DNS records must be pointing to Cloudflare's nameservers
3. Tunnel DNS route must be created (this is done automatically during setup)

### Service Not Starting

Check the systemd logs:

```bash
sudo journalctl -u mcphub-tunnel -e
```

## Comparison with Previous Solution

This simplified solution offers several advantages over the previous implementation:

1. **Reduced Complexity**: Eliminates the Cloudflare Worker layer, reducing complexity and potential points of failure
2. **Simplified Configuration**: Single script with clear commands instead of multiple scripts
3. **Improved Reliability**: Built-in health checks and automatic recovery
4. **Better Docker Integration**: Uses official Cloudflare image instead of a custom Dockerfile
5. **Cleaner Systemd Integration**: Proper systemd service with dependency management
6. **Reduced Dependencies**: No need for Node.js or other dependencies for the Worker

## Advanced Configuration

For advanced configuration, you can manually edit the configuration file:

```bash
nano ~/.mcphub-online/config.yml
```

Refer to the [Cloudflare Tunnel documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/configuration/config) for detailed configuration options.

## Uninstallation

To completely remove MCPHub Online:

```bash
# Uninstall the service
./mcphub-online.sh uninstall

# Remove the configuration
rm -rf ~/.mcphub-online

# Remove the logs
sudo rm -rf /var/log/mcphub-online
```

