# MCPhub Cloudflare Deployment Guide

This guide explains how to deploy MCPhub with Cloudflare integration, making your MCPhub instance accessible via a custom domain with SSL/TLS encryption.

## Overview

MCPhub can be deployed with Cloudflare in two ways:

1. **Cloudflare Tunnel**: Expose your local MCPhub instance through Cloudflare's network
2. **Cloudflare Worker**: Deploy a worker that proxies requests to your MCPhub instance

Both approaches provide:
- SSL/TLS encryption
- Custom domain support
- Secure access to your MCPhub instance

## Prerequisites

- Cloudflare account with your domain configured
- Domain DNS managed by Cloudflare
- MCPhub running locally or on a server

## Option 1: Cloudflare Tunnel (Recommended for Local Deployment)

Cloudflare Tunnel creates a secure connection between your local MCPhub instance and Cloudflare's edge network, eliminating the need for port forwarding or public IP addresses.

### Automated Setup

```bash
# Run the automated setup script
chmod +x scripts/setup-cloudflare-tunnel.sh
DOMAIN="pixeliumperfecto.co.uk" ./scripts/setup-cloudflare-tunnel.sh
```

The script will:
1. Install `cloudflared` if not already installed
2. Authenticate with Cloudflare
3. Create a tunnel
4. Configure DNS routing
5. Start the tunnel
6. Generate client configuration

### Manual Setup

If you prefer to set up the tunnel manually:

1. **Install cloudflared**:
   ```bash
   curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared.deb
   ```

2. **Authenticate with Cloudflare**:
   ```bash
   cloudflared tunnel login
   ```

3. **Create a tunnel**:
   ```bash
   cloudflared tunnel create mcphub-tunnel
   ```

4. **Configure the tunnel**:
   ```bash
   mkdir -p ~/.cloudflared
   
   # Create config file
   cat > ~/.cloudflared/config.yml <<EOF
   tunnel: YOUR_TUNNEL_ID
   credentials-file: ~/.cloudflared/YOUR_TUNNEL_ID.json
   
   ingress:
     - hostname: pixeliumperfecto.co.uk
       service: http://localhost:3000
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
   ```

5. **Route DNS**:
   ```bash
   cloudflared tunnel route dns mcphub-tunnel pixeliumperfecto.co.uk
   ```

6. **Start the tunnel**:
   ```bash
   cloudflared tunnel run
   ```

## Option 2: Cloudflare Worker (Recommended for Public Deployment)

Cloudflare Workers provide a serverless platform to run your code at the edge of Cloudflare's network. You can deploy a worker that proxies requests to your MCPhub instance.

### Setup

1. **Install Wrangler CLI**:
   ```bash
   npm install -g wrangler
   ```

2. **Authenticate with Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Configure the worker**:
   The repository includes a pre-configured worker in the `cloudflare-worker` directory.

4. **Deploy the worker**:
   ```bash
   cd cloudflare-worker
   npm install
   wrangler deploy --env production
   ```

5. **Configure DNS**:
   Add a CNAME record for `mcp.pixeliumperfecto.co.uk` pointing to your worker.

### Worker Configuration

The worker is configured in `cloudflare-worker/wrangler.toml`:

```toml
name = "mcp"
main = "src/index.js"
compatibility_date = "2024-01-01"

[env.production]
name = "mcp"
route = { pattern = "mcp.pixeliumperfecto.co.uk/*", zone_name = "pixeliumperfecto.co.uk" }

[vars]
MCPHUB_BACKEND_URL = "http://localhost:3000"
ALLOWED_ORIGINS = "https://pixeliumperfecto.co.uk,http://localhost:3000"
```

You can customize these settings to match your deployment.

## Client Configuration

After deploying MCPhub with Cloudflare, you need to update your MCP client configuration to use the Cloudflare URL.

### Generate Client Configuration

```bash
node scripts/generate-client-config.js --deployment cloudflare --domain pixeliumperfecto.co.uk
```

This will generate a configuration file like:

```json
{
  "mcpServers": {
    "MCPhub": {
      "type": "sse",
      "url": "https://pixeliumperfecto.co.uk/sse",
      "keepAliveInterval": 60000,
      "owner": "admin"
    }
  }
}
```

## Troubleshooting

### Tunnel Issues

If you're having issues with the Cloudflare Tunnel:

```bash
# Check tunnel status
cloudflared tunnel list

# Validate tunnel configuration
cloudflared tunnel ingress validate

# Check tunnel logs
tail -f /tmp/cloudflared.log
```

### Worker Issues

If you're having issues with the Cloudflare Worker:

```bash
# Check worker logs
wrangler tail

# Test worker locally
wrangler dev

# Check worker routes
wrangler routes list
```

### Connection Issues

If clients can't connect to your MCPhub instance:

1. Check that the tunnel or worker is running
2. Verify DNS configuration
3. Test the connection with curl:
   ```bash
   curl -v https://pixeliumperfecto.co.uk/health
   ```
4. Check for CORS issues in browser console

## Security Considerations

- **API Keys**: Consider using API keys to secure your MCPhub instance
- **Access Control**: Configure Cloudflare Access for additional security
- **Rate Limiting**: Set up rate limiting rules in Cloudflare dashboard
- **Firewall Rules**: Configure Cloudflare Firewall rules to block malicious traffic

## Additional Resources

- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare DNS Documentation](https://developers.cloudflare.com/dns/)

