# MCPhub WSL2 Deployment Guide

This guide walks you through deploying MCPhub on WSL2 with PostgreSQL database backend, API key authentication, and Cloudflare Tunnel integration.

## 🎯 What You'll Get

- **MCPhub** running on WSL2 with database-backed configuration
- **PostgreSQL** database for storing MCP server configurations and user data
- **API Key Authentication** for secure MCP client connections
- **Cloudflare Tunnel** for public access via your domain
- **Automated Management Scripts** for easy operation

## 📋 Prerequisites

### Windows Requirements
- Windows 10/11 with WSL2 enabled
- Ubuntu 20.04+ installed in WSL2
- At least 4GB RAM and 10GB free disk space

### Cloudflare Requirements (Optional)
- Cloudflare account with your domain configured
- Domain DNS managed by Cloudflare

## 🚀 Quick Start

### 1. Clone and Run Deployment Script

```bash
# In WSL2 Ubuntu terminal
git clone https://github.com/samanhappy/mcphub.git
cd mcphub

# Make deployment script executable
chmod +x deploy-wsl2-mcphub.sh

# Run deployment with your domain
DOMAIN="pixeliumperfecto.co.uk" ./deploy-wsl2-mcphub.sh
```

### 2. Access MCPhub Dashboard

```bash
# Local access
http://localhost:3000

# Default login: admin / admin123
```

### 3. Generate API Key

```bash
# Generate a secure API key
~/generate-api-key.sh
```

### 4. Configure MCP Client

Use the generated configuration in your MCP client:

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

## 📖 Detailed Setup

### Database Configuration

The deployment automatically sets up PostgreSQL with:

- **Database**: `mcphub`
- **User**: `mcphub_user`
- **Password**: Auto-generated (saved in logs)
- **Schema**: Complete MCPhub database schema with tables for servers, users, API keys, and logs

### API Key Authentication

MCPhub supports multiple authentication methods:

1. **Database-backed API Keys** (Recommended)
   - Stored securely in PostgreSQL
   - Per-user permissions
   - Usage tracking and logging

2. **Legacy Bearer Tokens**
   - System-wide bearer token
   - Configured in system settings

3. **JWT Tokens**
   - For web dashboard access
   - Session-based authentication

### Cloudflare Tunnel Setup

The deployment includes automated Cloudflare Tunnel setup:

```bash
# Tunnel configuration is created at ~/.cloudflared/config.yml
# Supports:
# - Main domain: https://your-domain.com
# - API subdomain: https://api.your-domain.com
# - Health checks: https://health.your-domain.com
```

## 🔧 Management Commands

### Service Management

```bash
# Start all services
~/start-mcphub.sh

# Stop all services
~/stop-mcphub.sh

# Check service status
~/mcphub-status.sh
```

### API Key Management

```bash
# Generate new API key
~/generate-api-key.sh

# View API key usage (requires database access)
psql -U mcphub_user -d mcphub -c "SELECT * FROM api_keys;"
```

### PM2 Process Management

```bash
# View running processes
pm2 list

# View logs
pm2 logs mcphub

# Restart MCPhub
pm2 restart mcphub

# Monitor processes
pm2 monit
```

### Cloudflare Tunnel Management

```bash
# Start tunnel
~/start-tunnel.sh

# Stop tunnel
~/stop-tunnel.sh

# Check tunnel status
~/tunnel-status.sh

# View tunnel logs
tail -f /tmp/tunnel.log
```

## 🔒 Security Features

### Database Security
- Encrypted password storage using bcrypt
- Connection logging and monitoring
- SQL injection protection with parameterized queries

### API Key Security
- Cryptographically secure key generation
- Hashed storage in database
- Per-key permissions and expiration
- Usage tracking and rate limiting

### Network Security
- Cloudflare Tunnel eliminates need for port forwarding
- SSL/TLS encryption for all connections
- Real IP detection through Cloudflare headers

## 🛠️ Configuration

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

### MCPhub Configuration

Database-backed configuration replaces `mcp_settings.json`:

- **MCP Servers**: Stored in `mcp_servers` table
- **Users**: Stored in `users` table with encrypted passwords
- **Groups**: Stored in `groups` and `group_members` tables
- **System Config**: Stored in `system_config` table

### Nginx Configuration

Local reverse proxy configuration:

```nginx
server {
    listen 80;
    server_name localhost;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Important for SSE connections
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;
    }
}
```

## 🔍 Troubleshooting

### Common Issues

#### MCPhub Won't Start
```bash
# Check PM2 logs
pm2 logs mcphub

# Check database connection
psql -U mcphub_user -d mcphub -c "SELECT 1;"

# Restart services
~/stop-mcphub.sh && ~/start-mcphub.sh
```

#### Database Connection Issues
```bash
# Check PostgreSQL status
sudo service postgresql status

# Restart PostgreSQL
sudo service postgresql restart

# Check database credentials
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

#### API Key Authentication Fails
```bash
# Test API key
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/health

# Check API key in database
psql -U mcphub_user -d mcphub -c "SELECT key_name, is_active, last_used FROM api_keys;"
```

### Log Locations

- **MCPhub Logs**: `/tmp/mcphub-combined.log`
- **Setup Logs**: `/tmp/mcphub-wsl2-setup.log`
- **Tunnel Logs**: `/tmp/tunnel.log`
- **PM2 Logs**: `pm2 logs mcphub`

### Performance Tuning

#### Database Optimization
```sql
-- Check database performance
SELECT * FROM pg_stat_activity WHERE datname = 'mcphub';

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM mcp_servers WHERE is_enabled = true;
```

#### Memory Usage
```bash
# Check memory usage
free -h

# Check PM2 memory usage
pm2 monit

# Restart if memory usage is high
pm2 restart mcphub
```

## 🔄 Backup and Recovery

### Database Backup
```bash
# Create backup
pg_dump -U mcphub_user -d mcphub > mcphub_backup_$(date +%Y%m%d).sql

# Restore backup
psql -U mcphub_user -d mcphub < mcphub_backup_20240101.sql
```

### Configuration Backup
```bash
# Backup configuration files
tar -czf mcphub_config_backup.tar.gz ~/mcphub/.env ~/mcphub/mcp_settings.json ~/.cloudflared/
```

## 🚀 Advanced Configuration

### Custom MCP Servers

Add custom MCP servers through the web interface or database:

```sql
INSERT INTO mcp_servers (name, display_name, server_type, config, owner_id, is_enabled)
VALUES (
    'custom_server',
    'My Custom Server',
    'stdio',
    '{"command": "python", "args": ["my_server.py"], "env": {}}',
    (SELECT id FROM users WHERE username = 'admin'),
    true
);
```

### Multi-User Setup

Create additional users:

```bash
# Through web interface (recommended)
# Or via database:
psql -U mcphub_user -d mcphub -c "
INSERT INTO users (username, password_hash, email, is_admin)
VALUES ('newuser', crypt('password', gen_salt('bf')), 'user@example.com', false);
"
```

### Smart Routing

Enable AI-powered tool discovery:

1. Configure OpenAI API key in system settings
2. Set up PostgreSQL with pgvector extension
3. Enable smart routing in MCPhub dashboard

## 📚 Additional Resources

- [MCPhub Documentation](https://github.com/samanhappy/mcphub)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## 🆘 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review log files for error messages
3. Create an issue on the [MCPhub GitHub repository](https://github.com/samanhappy/mcphub/issues)
4. Join the [Discord community](https://discord.gg/qMKNsn5Q) for support

