# MCPhub WSL2 + Cloudflare + Database Implementation

Complete implementation of MCPhub with PostgreSQL database backend, enhanced API key authentication, and Cloudflare Tunnel integration for WSL2 deployment.

## 🎯 What This Provides

Transform your MCPhub deployment from file-based configuration to a production-ready system with:

- **🗄️ PostgreSQL Database Backend** - Replace `mcp_settings.json` with robust database storage
- **🔐 Enhanced API Key Authentication** - Database-backed API keys with per-user permissions
- **🌐 Cloudflare Tunnel Integration** - Secure public access via your custom domain
- **🚀 WSL2 Optimized Deployment** - Complete automation for Windows WSL2 environment
- **📊 Usage Analytics & Logging** - Track connections, tool usage, and performance metrics
- **🛠️ Management Tools** - Scripts and utilities for easy operation

## 🚀 Quick Start

### One-Command Deployment

```bash
# Clone and deploy MCPhub with all enhancements
git clone https://github.com/your-repo/mcphub-enhanced.git
cd mcphub-enhanced

# Deploy with your domain
DOMAIN="pixeliumperfecto.co.uk" ./deploy-wsl2-mcphub.sh
```

### Client Configuration

After deployment, use this configuration in your MCP client:

```json
{
  "mcpServers": {
    "MCPhub": {
      "type": "sse",
      "url": "https://pixeliumperfecto.co.uk/sse",
      "keepAliveInterval": 60000,
      "owner": "admin",
      "env": "YOUR_API_KEY_HERE"
    }
  }
}
```

## 📋 Features

### Database-Backed Configuration
- **PostgreSQL Storage**: All MCP server configurations stored in database
- **User Management**: Multi-user support with role-based permissions
- **Configuration History**: Track changes and rollback capabilities
- **Performance**: Cached configuration loading with 30-second TTL

### Enhanced Authentication
- **API Key System**: Database-backed API keys with granular permissions
- **Multiple Auth Methods**: Bearer tokens, JWT, and legacy support
- **Usage Tracking**: Monitor API key usage and enforce rate limits
- **Security**: Bcrypt password hashing and secure key generation

### Cloudflare Integration
- **Tunnel Setup**: Automated Cloudflare Tunnel configuration
- **SSL/TLS**: End-to-end encryption with Cloudflare certificates
- **Domain Management**: Support for custom domains and subdomains
- **WSL2 Optimized**: No port forwarding or firewall configuration needed

### Analytics & Monitoring
- **Connection Logging**: Track all MCP server connections
- **Tool Usage Analytics**: Monitor tool execution and performance
- **Health Monitoring**: Comprehensive health checks and status reporting
- **Performance Metrics**: Response times, error rates, and usage patterns

## 🏗️ Architecture

### Database Schema

```sql
-- Core tables for MCPhub configuration
users              -- User accounts and authentication
api_keys           -- Database-backed API key management
mcp_servers        -- MCP server configurations
groups             -- Server groupings and organization
group_members      -- Many-to-many server-group relationships
system_config      -- Global system configuration
connection_logs    -- Connection tracking and analytics
tool_usage_logs    -- Tool execution monitoring
```

### Service Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   MCP Client    │────│  Cloudflare      │────│   WSL2 Host     │
│                 │    │  Tunnel          │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                ┌─────────────────┐
                                                │     MCPhub      │
                                                │  (Node.js/PM2)  │
                                                └─────────────────┘
                                                         │
                                                ┌─────────────────┐
                                                │   PostgreSQL    │
                                                │   Database      │
                                                └─────────────────┘
```

## 📁 Project Structure

```
mcphub-enhanced/
├── database/
│   ├── migrations/
│   │   └── 001_initial_schema.sql      # Database schema
│   └── seeds/
│       └── default_data.sql            # Initial data
├── src/
│   ├── services/
│   │   └── databaseService.ts          # Database abstraction layer
│   ├── config/
│   │   └── database.ts                 # Database configuration
│   ├── middlewares/
│   │   └── enhancedAuth.ts             # Enhanced authentication
│   └── utils/
│       └── configGenerator.ts          # Client config generation
├── scripts/
│   ├── setup-cloudflare-tunnel.sh     # Cloudflare Tunnel setup
│   └── generate-client-config.js      # Client config generator
├── docs/
│   ├── WSL2_DEPLOYMENT.md              # Deployment guide
│   ├── CLOUDFLARE_SETUP.md             # Cloudflare configuration
│   └── API_REFERENCE.md                # Complete API documentation
├── deploy-wsl2-mcphub.sh               # Main deployment script
└── README.md                           # This file
```

## 🛠️ Installation & Setup

### Prerequisites

- **Windows 10/11** with WSL2 enabled
- **Ubuntu 20.04+** in WSL2
- **Cloudflare Account** with domain configured (optional)
- **4GB RAM** and **10GB disk space**

### Automated Deployment

```bash
# 1. Clone the repository
git clone https://github.com/your-repo/mcphub-enhanced.git
cd mcphub-enhanced

# 2. Make deployment script executable
chmod +x deploy-wsl2-mcphub.sh
chmod +x scripts/setup-cloudflare-tunnel.sh

# 3. Run deployment
DOMAIN="your-domain.com" ./deploy-wsl2-mcphub.sh
```

### Manual Setup

For step-by-step manual installation, see [WSL2_DEPLOYMENT.md](docs/WSL2_DEPLOYMENT.md).

## 🔧 Configuration

### Environment Variables

The deployment creates a `.env` file with:

```bash
# Database Configuration
DB_NAME=mcphub
DB_USER=mcphub_user
DB_PASS=auto_generated_password
DB_HOST=localhost
DB_PORT=5432

# Application Configuration
NODE_ENV=production
PORT=3000
JWT_SECRET=auto_generated_secret

# Cloudflare Configuration
DOMAIN=your-domain.com
TUNNEL_NAME=mcphub-wsl2
```

### Database Configuration

Replace file-based `mcp_settings.json` with database storage:

```typescript
// Load settings from database
const settings = await loadSettings(user);

// Save settings to database
await saveSettings(updatedSettings, user);

// Create API key
const apiKey = await createApiKey('My Key', username, permissions);
```

### API Key Management

```bash
# Generate new API key
~/generate-api-key.sh

# List API keys (via database)
psql -U mcphub_user -d mcphub -c "SELECT key_name, is_active, created_at FROM api_keys;"
```

## 🚀 Usage

### Service Management

```bash
# Start all services
~/start-mcphub.sh

# Stop all services
~/stop-mcphub.sh

# Check service status
~/mcphub-status.sh
```

### Client Configuration Generation

```bash
# Generate configuration for your deployment
node scripts/generate-client-config.js \
  --deployment cloudflare \
  --domain pixeliumperfecto.co.uk \
  --generate-api-key \
  --output mcphub-config.json
```

### API Usage

```bash
# Health check
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://pixeliumperfecto.co.uk/api/health

# List servers
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://pixeliumperfecto.co.uk/api/servers

# Execute tool
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"arguments":{"url":"https://example.com"}}' \
  https://pixeliumperfecto.co.uk/tools/call/fetch/fetch_url
```

## 📊 Monitoring & Analytics

### Database Queries

```sql
-- Connection statistics
SELECT 
  s.name as server_name,
  COUNT(*) as total_connections,
  AVG(duration_seconds) as avg_duration
FROM connection_logs cl
JOIN mcp_servers s ON cl.server_id = s.id
WHERE cl.connected_at > NOW() - INTERVAL '24 hours'
GROUP BY s.name;

-- Tool usage statistics
SELECT 
  tool_name,
  COUNT(*) as total_calls,
  AVG(execution_time_ms) as avg_execution_time,
  COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_calls
FROM tool_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY tool_name
ORDER BY total_calls DESC;
```

### Health Monitoring

```bash
# Check all services
~/mcphub-status.sh

# View logs
pm2 logs mcphub
tail -f /tmp/tunnel.log
tail -f /tmp/mcphub-wsl2-setup.log
```

## 🔐 Security

### Authentication Methods

1. **API Keys** (Recommended)
   - Database-backed with permissions
   - Usage tracking and rate limiting
   - Secure generation and storage

2. **JWT Tokens**
   - Web dashboard authentication
   - Session-based access control

3. **Bearer Tokens**
   - Legacy system-wide tokens
   - Backward compatibility

### Security Features

- **Encrypted Storage**: Bcrypt password hashing
- **Secure Tunnels**: Cloudflare Tunnel with SSL/TLS
- **Access Control**: Role-based permissions
- **Audit Logging**: Complete connection and usage logs
- **Rate Limiting**: Per-key request limits

## 🔧 Troubleshooting

### Common Issues

#### Database Connection Failed
```bash
# Check PostgreSQL status
sudo service postgresql status

# Test connection
psql -U mcphub_user -d mcphub -c "SELECT 1;"

# Check credentials
cat ~/mcphub/.env
```

#### Cloudflare Tunnel Issues
```bash
# Check tunnel status
~/tunnel-status.sh

# View tunnel logs
tail -f /tmp/tunnel.log

# Restart tunnel
~/stop-tunnel.sh && ~/start-tunnel.sh
```

#### API Authentication Fails
```bash
# Test API key
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/health

# Check API keys in database
psql -U mcphub_user -d mcphub -c "SELECT * FROM api_keys WHERE is_active = true;"
```

### Log Locations

- **Setup Logs**: `/tmp/mcphub-wsl2-setup.log`
- **MCPhub Logs**: `/tmp/mcphub-combined.log`
- **Tunnel Logs**: `/tmp/tunnel.log`
- **PM2 Logs**: `pm2 logs mcphub`

## 📚 Documentation

- **[WSL2 Deployment Guide](docs/WSL2_DEPLOYMENT.md)** - Complete setup instructions
- **[Cloudflare Setup Guide](docs/CLOUDFLARE_SETUP.md)** - Tunnel configuration
- **[API Reference](docs/API_REFERENCE.md)** - Complete API documentation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests and documentation
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **GitHub Issues**: [Create an issue](https://github.com/your-repo/mcphub-enhanced/issues)
- **Documentation**: Check the `docs/` directory
- **Community**: Join the [Discord server](https://discord.gg/mcphub)

## 🙏 Acknowledgments

- **MCPhub Team** - Original MCPhub implementation
- **Cloudflare** - Tunnel technology and infrastructure
- **PostgreSQL** - Robust database backend
- **Community Contributors** - Bug reports and feature requests

---

**Made with ❤️ for the MCP community**

