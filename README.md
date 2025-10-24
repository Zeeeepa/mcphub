# MCPHub: The Unified Hub for Model Context Protocol (MCP) Servers

English | [Français](README.fr.md) | [中文版](README.zh.md)

MCPHub makes it easy to manage and scale multiple MCP (Model Context Protocol) servers by organizing them into flexible Streamable HTTP (SSE) endpoints—supporting access to all servers, individual servers, or logical server groups.

![Dashboard Preview](assets/dashboard.png)

## 🌐 Live Demo & Docs

- **Documentation**: [docs.mcphubx.com](https://docs.mcphubx.com/)
- **Demo Environment**: [demo.mcphubx.com](https://demo.mcphubx.com/)

## 🚀 Features

- **Broadened MCP Server Support**: Seamlessly integrate any MCP server with minimal configuration.
- **Centralized Dashboard**: Monitor real-time status and performance metrics from one sleek web UI.
- **Flexible Protocol Handling**: Full compatibility with both stdio and SSE MCP protocols.
- **Hot-Swappable Configuration**: Add, remove, or update MCP servers on the fly — no downtime required.
- **Group-Based Access Control**: Organize servers into customizable groups for streamlined permissions management.
- **Secure Authentication**: Built-in user management with role-based access powered by JWT and bcrypt.
- **Docker-Ready**: Deploy instantly with our containerized setup.
- **Cloudflare Integration**: Expose your local MCPHub server to the internet securely using Cloudflare Tunnel and Workers.

## 🔧 Quick Start

### Local Installation

```bash
# Clone the repository
git clone https://github.com/Zeeeepa/mcphub.git
cd mcphub

# Install dependencies
npm install

# Start the server
npm start
```

### Docker Installation

```bash
# Pull the image
docker pull samanhappy/mcphub

# Run the container
docker run -p 3000:3000 -v $(pwd)/mcp_settings.json:/app/mcp_settings.json samanhappy/mcphub
```

### Docker Compose Installation

```bash
# Create a docker-compose.yml file
cat > docker-compose.yml << EOL
version: '3.8'
services:
  mcphub:
    image: samanhappy/mcphub
    ports:
      - "3000:3000"
    volumes:
      - ./mcp_settings.json:/app/mcp_settings.json
EOL

# Start the container
docker-compose up -d
```

## 🌐 Exposing MCPHub to the Internet

MCPHub can be exposed to the internet securely using Cloudflare Tunnel and Cloudflare Workers. This allows you to access your local MCPHub server from anywhere in the world without opening ports on your firewall.

### Prerequisites

- A Cloudflare account
- A domain registered with Cloudflare (optional, but recommended)
- Cloudflare API key and Account ID

### Automated Setup

We provide a set of scripts to automate the setup process:

```bash
# Clone the repository if you haven't already
git clone https://github.com/Zeeeepa/mcphub.git
cd mcphub

# Make the deployment script executable
chmod +x deploy.sh

# Run the deployment script
./deploy.sh
```

The script will:
1. Create a `.env` file with your Cloudflare credentials
2. Set up a Cloudflare Tunnel to securely expose your local MCPHub server
3. Deploy a Cloudflare Worker to handle routing and request transformation
4. Set up health monitoring for your deployment

### Manual Setup

If you prefer to set up the components manually:

#### 1. Set up Cloudflare Tunnel

```bash
# Install cloudflared
# On Debian/Ubuntu:
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Authenticate with Cloudflare
cloudflared tunnel login

# Create a new tunnel
cloudflared tunnel create mcphub-tunnel

# Configure the tunnel
mkdir -p /etc/cloudflared
cat > /etc/cloudflared/config.yml << EOL
tunnel: YOUR_TUNNEL_ID
credentials-file: /etc/cloudflared/credentials.json
ingress:
  - hostname: mcp.your-domain.com
    service: http://localhost:3000
  - service: http_status:404
EOL

# Create DNS record
cloudflared tunnel route dns YOUR_TUNNEL_ID mcp.your-domain.com

# Start the tunnel
cloudflared tunnel run YOUR_TUNNEL_ID
```

#### 2. Set up Cloudflare Worker (Optional)

If you want to add additional functionality like authentication or rate limiting:

```bash
# Install Wrangler
npm install -g wrangler

# Create a new worker
mkdir -p cloudflare-worker
cd cloudflare-worker

# Create worker script
cat > worker.js << EOL
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  url.hostname = "mcp.your-domain.com"
  
  return fetch(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body
  })
}
EOL

# Deploy the worker
wrangler publish
```

### Docker Compose Setup with Cloudflare Tunnel

For a complete setup using Docker Compose:

```bash
# Create docker-compose.yml
cat > docker-compose.yml << EOL
version: '3.8'
services:
  mcphub:
    image: samanhappy/mcphub
    container_name: mcphub
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./mcp_settings.json:/app/mcp_settings.json
    environment:
      - PORT=3000
      - NODE_ENV=production

  cloudflared:
    image: cloudflare/cloudflared
    container_name: cloudflared
    restart: unless-stopped
    volumes:
      - ./cloudflare-tunnel/config.yml:/etc/cloudflared/config.yml
      - ~/.cloudflared:/etc/cloudflared
    command: tunnel run
    depends_on:
      - mcphub
EOL

# Start the services
docker-compose up -d
```

## 📝 Configuration

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```
# MCPHub Configuration
PORT=3000
NODE_ENV=development
BASE_PATH=

# Cloudflare Configuration
CLOUDFLARE_EMAIL=your-email@example.com
CLOUDFLARE_API_KEY=your-api-key
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_WORKER_NAME=dashboard
DOMAIN=example.com
CLOUDFLARE_WORKER_URL=https://dashboard.example.com.workers.dev

# Alert Configuration
ALERT_EMAIL=alerts@example.com
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
```

### MCP Settings

Create a `mcp_settings.json` file in the root directory with your MCP server configuration:

```json
{
  "servers": [
    {
      "id": "server1",
      "name": "Server 1",
      "description": "First MCP server",
      "url": "http://localhost:8080",
      "groups": ["group1"]
    },
    {
      "id": "server2",
      "name": "Server 2",
      "description": "Second MCP server",
      "url": "http://localhost:8081",
      "groups": ["group2"]
    }
  ],
  "groups": [
    {
      "id": "group1",
      "name": "Group 1",
      "description": "First group"
    },
    {
      "id": "group2",
      "name": "Group 2",
      "description": "Second group"
    }
  ]
}
```

## 🔒 Security Considerations

When exposing your MCPHub server to the internet, consider the following security measures:

1. **Authentication**: Enable authentication in MCPHub to prevent unauthorized access.
2. **Rate Limiting**: Use Cloudflare's rate limiting features to prevent abuse.
3. **IP Restrictions**: Configure Cloudflare to only allow access from specific IP addresses.
4. **HTTPS**: Ensure all connections use HTTPS to encrypt data in transit.
5. **Regular Updates**: Keep MCPHub, Cloudflare Tunnel, and all dependencies up to date.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

