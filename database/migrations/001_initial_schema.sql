-- MCPhub Database Schema Migration
-- This replaces the file-based mcp_settings.json with PostgreSQL storage

-- Enable UUID extension for generating unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table - stores MCPhub user accounts
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- API Keys table - stores authentication keys for MCP server access
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    key_name VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    permissions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP WITH TIME ZONE
);

-- Groups table - stores server groupings
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- MCP Servers table - stores individual server configurations
CREATE TABLE IF NOT EXISTS mcp_servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    description TEXT,
    server_type VARCHAR(50) DEFAULT 'stdio', -- stdio, sse, streamable-http, openapi
    config JSONB NOT NULL, -- Full server configuration
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Group Members table - many-to-many relationship between groups and servers
CREATE TABLE IF NOT EXISTS group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    server_id UUID REFERENCES mcp_servers(id) ON DELETE CASCADE,
    tools_filter JSONB, -- Array of specific tools or 'all'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, server_id)
);

-- System Configuration table - stores global system settings
CREATE TABLE IF NOT EXISTS system_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_key VARCHAR(255) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id)
);

-- User Configuration table - stores per-user settings
CREATE TABLE IF NOT EXISTS user_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    config_key VARCHAR(255) NOT NULL,
    config_value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, config_key)
);

-- Server Tools table - stores tool-specific configurations and metadata
CREATE TABLE IF NOT EXISTS server_tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID REFERENCES mcp_servers(id) ON DELETE CASCADE,
    tool_name VARCHAR(255) NOT NULL,
    tool_description TEXT,
    input_schema JSONB,
    is_enabled BOOLEAN DEFAULT TRUE,
    custom_description TEXT, -- User-defined description override
    usage_count INTEGER DEFAULT 0,
    last_used TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(server_id, tool_name)
);

-- Connection Logs table - tracks MCP server connections and usage
CREATE TABLE IF NOT EXISTS connection_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID REFERENCES mcp_servers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    connection_type VARCHAR(50), -- sse, stdio, etc.
    status VARCHAR(50), -- connected, disconnected, error
    error_message TEXT,
    session_id VARCHAR(255),
    client_info JSONB, -- User agent, IP, etc.
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    disconnected_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER
);

-- Tool Usage Logs table - tracks individual tool invocations
CREATE TABLE IF NOT EXISTS tool_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID REFERENCES mcp_servers(id) ON DELETE CASCADE,
    tool_name VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    input_data JSONB,
    output_data JSONB,
    execution_time_ms INTEGER,
    status VARCHAR(50), -- success, error, timeout
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_name ON mcp_servers(name);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_owner ON mcp_servers(owner_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(is_enabled);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_type ON mcp_servers(server_type);
CREATE INDEX IF NOT EXISTS idx_groups_owner ON groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_server ON group_members(server_id);
CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(config_key);
CREATE INDEX IF NOT EXISTS idx_user_config_user ON user_config(user_id);
CREATE INDEX IF NOT EXISTS idx_user_config_key ON user_config(config_key);
CREATE INDEX IF NOT EXISTS idx_server_tools_server ON server_tools(server_id);
CREATE INDEX IF NOT EXISTS idx_server_tools_name ON server_tools(tool_name);
CREATE INDEX IF NOT EXISTS idx_server_tools_enabled ON server_tools(is_enabled);
CREATE INDEX IF NOT EXISTS idx_connection_logs_server ON connection_logs(server_id);
CREATE INDEX IF NOT EXISTS idx_connection_logs_user ON connection_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_connection_logs_session ON connection_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_connection_logs_connected_at ON connection_logs(connected_at);
CREATE INDEX IF NOT EXISTS idx_tool_usage_logs_server ON tool_usage_logs(server_id);
CREATE INDEX IF NOT EXISTS idx_tool_usage_logs_tool ON tool_usage_logs(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_usage_logs_user ON tool_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_tool_usage_logs_session ON tool_usage_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_usage_logs_created_at ON tool_usage_logs(created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mcp_servers_updated_at BEFORE UPDATE ON mcp_servers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON system_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_config_updated_at BEFORE UPDATE ON user_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_server_tools_updated_at BEFORE UPDATE ON server_tools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

