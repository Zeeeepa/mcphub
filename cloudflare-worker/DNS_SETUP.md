# DNS Configuration for MCPhub Custom Domains

This guide explains how to configure DNS settings to make MCPhub accessible at custom domains.

## Prerequisites

1. A Cloudflare account with access to the domain `pixelium.co.uk`
2. The Cloudflare Worker deployed at `mcp.pixelium.workers.dev`

## DNS Configuration Steps

### 1. Log in to Cloudflare Dashboard

Go to the Cloudflare dashboard and select the `pixelium.co.uk` domain.

### 2. Configure DNS Records

Add the following DNS records:

#### For Frontend (www.pixelium.co.uk)

| Type | Name | Content | Proxy Status |
|------|------|---------|-------------|
| CNAME | www | mcp.pixelium.workers.dev | Proxied ☁️ |

#### For API (api.pixelium.co.uk)

| Type | Name | Content | Proxy Status |
|------|------|---------|-------------|
| CNAME | api | mcp.pixelium.workers.dev | Proxied ☁️ |

### 3. Configure Cloudflare Worker Routes

Ensure the following routes are configured in your Cloudflare Worker:

```toml
[triggers]
routes = [
  { pattern = "mcp.pixelium.workers.dev/*", zone_name = "pixelium.workers.dev" },
  { pattern = "www.pixelium.co.uk/*", zone_name = "pixelium.co.uk" },
  { pattern = "api.pixelium.co.uk/*", zone_name = "pixelium.co.uk" }
]
```

### 4. Verify DNS Propagation

DNS changes can take up to 24-48 hours to propagate, but typically they take effect within a few minutes to a few hours.

You can check DNS propagation using:

```bash
dig www.pixelium.co.uk
dig api.pixelium.co.uk
```

### 5. Test the Custom Domains

After DNS propagation, test the custom domains:

```bash
curl -I https://www.pixelium.co.uk
curl https://api.pixelium.co.uk/health
curl -N https://api.pixelium.co.uk/sse
```

## Troubleshooting

### Custom Domains Not Working

1. **Check DNS Records**: Ensure the DNS records are correctly configured in Cloudflare.
2. **Verify Worker Routes**: Make sure the worker routes are correctly configured.
3. **Check SSL/TLS Settings**: Ensure SSL/TLS is set to "Full" or "Flexible" in Cloudflare.
4. **Clear DNS Cache**: Try clearing your DNS cache or using a different network.

### Worker Not Responding

1. **Check Worker Deployment**: Ensure the worker is deployed correctly.
2. **Verify Worker Code**: Check the worker code for errors.
3. **Check Cloudflare Status**: Verify Cloudflare services are operational.

### Backend Connection Issues

1. **Check Backend Server**: Ensure the backend server is running and accessible.
2. **Verify Backend URL**: Make sure the backend URL in the worker configuration is correct.
3. **Check Firewall Settings**: Ensure the backend server allows connections from Cloudflare IPs.

