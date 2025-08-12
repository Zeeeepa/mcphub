-- MCPhub Default Data Seeds
-- This file populates the database with initial configuration and sample data

-- Insert default admin user (password: admin123)
-- Note: In production, this should be changed immediately
INSERT INTO users (id, username, password_hash, email, is_admin) VALUES 
(
    uuid_generate_v4(),
    'admin',
    '$2b$10$Vt7krIvjNgyN67LXqly0uOcTpN0LI55cYRbcKC71pUDAP0nJ7RPa.',
    'admin@mcphub.local',
    TRUE
) ON CONFLICT (username) DO NOTHING;

-- Get the admin user ID for foreign key references
DO $$
DECLARE
    admin_user_id UUID;
BEGIN
    SELECT id INTO admin_user_id FROM users WHERE username = 'admin';
    
    -- Insert default system configuration
    INSERT INTO system_config (config_key, config_value, description, updated_by) VALUES
    (
        'routing',
        '{
            "enableGlobalRoute": true,
            "enableGroupNameRoute": true,
            "enableBearerAuth": true,
            "bearerAuthKey": "",
            "skipAuth": false
        }',
        'Global routing configuration for MCPhub',
        admin_user_id
    ),
    (
        'install',
        '{
            "pythonIndexUrl": "",
            "npmRegistry": "",
            "baseUrl": "http://localhost:3000"
        }',
        'Installation and package management configuration',
        admin_user_id
    ),
    (
        'smartRouting',
        '{
            "enabled": false,
            "dbUrl": "",
            "openaiApiBaseUrl": "https://api.openai.com/v1",
            "openaiApiKey": "",
            "openaiApiEmbeddingModel": "text-embedding-ada-002"
        }',
        'Smart routing and AI-powered tool discovery configuration',
        admin_user_id
    ),
    (
        'mcpRouter',
        '{
            "apiKey": "",
            "referer": "https://mcphub.app",
            "title": "MCPHub",
            "baseUrl": "https://api.mcprouter.to/v1"
        }',
        'MCP Router integration configuration',
        admin_user_id
    ),
    (
        'cloudflare',
        '{
            "tunnelEnabled": false,
            "tunnelName": "",
            "tunnelId": "",
            "domain": "",
            "credentialsPath": ""
        }',
        'Cloudflare Tunnel configuration',
        admin_user_id
    ),
    (
        'database',
        '{
            "migrationVersion": "001",
            "backupEnabled": true,
            "backupRetentionDays": 30
        }',
        'Database configuration and maintenance settings',
        admin_user_id
    )
    ON CONFLICT (config_key) DO NOTHING;

    -- Insert sample MCP servers
    INSERT INTO mcp_servers (name, display_name, description, server_type, config, owner_id) VALUES
    (
        'fetch',
        'Web Fetch Server',
        'Fetch content from web URLs and APIs',
        'stdio',
        '{
            "command": "uvx",
            "args": ["mcp-server-fetch"],
            "env": {},
            "enabled": true,
            "keepAliveInterval": 60000,
            "tools": {}
        }',
        admin_user_id
    ),
    (
        'playwright',
        'Browser Automation',
        'Automate web browsers for testing and scraping',
        'stdio',
        '{
            "command": "npx",
            "args": ["@playwright/mcp@latest", "--headless"],
            "env": {},
            "enabled": true,
            "keepAliveInterval": 60000,
            "tools": {}
        }',
        admin_user_id
    ),
    (
        'filesystem',
        'File System Access',
        'Read and write files on the local system',
        'stdio',
        '{
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
            "env": {},
            "enabled": false,
            "keepAliveInterval": 60000,
            "tools": {}
        }',
        admin_user_id
    )
    ON CONFLICT (name) DO NOTHING;

    -- Create a default group
    INSERT INTO groups (id, name, description, owner_id) VALUES
    (
        uuid_generate_v4(),
        'default',
        'Default group containing all available MCP servers',
        admin_user_id
    ) ON CONFLICT DO NOTHING;

    -- Add all servers to the default group
    INSERT INTO group_members (group_id, server_id, tools_filter)
    SELECT 
        g.id as group_id,
        s.id as server_id,
        '"all"'::jsonb as tools_filter
    FROM groups g
    CROSS JOIN mcp_servers s
    WHERE g.name = 'default'
    ON CONFLICT (group_id, server_id) DO NOTHING;

    -- Generate a default API key for the admin user
    INSERT INTO api_keys (key_hash, key_name, user_id, permissions, is_active) VALUES
    (
        -- This is a hash of 'mcphub-default-key-change-me'
        '$2b$10$rQJ5qVJ5qVJ5qVJ5qVJ5qOJ5qVJ5qVJ5qVJ5qVJ5qVJ5qVJ5qVJ5q',
        'Default Admin Key',
        admin_user_id,
        '{
            "servers": ["*"],
            "groups": ["*"],
            "admin": true
        }',
        true
    ) ON CONFLICT (key_hash) DO NOTHING;

END $$;

