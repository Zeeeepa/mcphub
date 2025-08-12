import { Pool, PoolClient } from 'pg';
import { McpSettings, ServerConfig, IUser, IGroup, SystemConfig } from '../types/index.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export class DatabaseService {
  private pool: Pool;
  private static instance: DatabaseService;

  constructor() {
    this.pool = new Pool({
      user: process.env.DB_USER || 'mcphub_user',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'mcphub',
      password: process.env.DB_PASS,
      port: parseInt(process.env.DB_PORT || '5432'),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 20,
    });

    // Test connection on initialization
    this.testConnection();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private async testConnection(): Promise<void> {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW()');
      console.log('Database connected successfully at:', result.rows[0].now);
      client.release();
    } catch (error) {
      console.error('Database connection error:', error);
      throw error;
    }
  }

  // Initialize database schema and default data
  public async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check if tables exist
      const tablesResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      `);

      if (tablesResult.rows.length === 0) {
        console.log('Initializing database schema...');
        
        // Read and execute schema migration
        const fs = await import('fs');
        const path = await import('path');
        const schemaPath = path.join(process.cwd(), 'database/migrations/001_initial_schema.sql');
        const seedsPath = path.join(process.cwd(), 'database/seeds/default_data.sql');

        if (fs.existsSync(schemaPath)) {
          const schemaSql = fs.readFileSync(schemaPath, 'utf8');
          await client.query(schemaSql);
          console.log('Database schema created successfully');
        }

        if (fs.existsSync(seedsPath)) {
          const seedsSql = fs.readFileSync(seedsPath, 'utf8');
          await client.query(seedsSql);
          console.log('Default data seeded successfully');
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Database initialization error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Load settings from database (replaces file-based loadSettings)
  public async loadSettings(user?: IUser): Promise<McpSettings> {
    const client = await this.pool.connect();
    try {
      // Get system configuration
      const systemConfigResult = await client.query(`
        SELECT config_key, config_value 
        FROM system_config
      `);

      const systemConfig: SystemConfig = {};
      systemConfigResult.rows.forEach(row => {
        systemConfig[row.config_key as keyof SystemConfig] = row.config_value;
      });

      // Get MCP servers
      let serversQuery = `
        SELECT name, display_name, description, server_type, config, is_enabled
        FROM mcp_servers
        WHERE is_enabled = true
      `;
      
      const queryParams: any[] = [];
      
      // Filter by user if provided
      if (user && !user.isAdmin) {
        serversQuery += ` AND owner_id = $1`;
        queryParams.push(await this.getUserId(user.username));
      }

      const serversResult = await client.query(serversQuery, queryParams);
      
      const mcpServers: { [key: string]: ServerConfig } = {};
      serversResult.rows.forEach(row => {
        mcpServers[row.name] = {
          ...row.config,
          enabled: row.is_enabled,
          displayName: row.display_name,
          description: row.description,
          type: row.server_type,
        };
      });

      // Get groups
      const groupsResult = await client.query(`
        SELECT g.id, g.name, g.description,
               json_agg(
                 json_build_object(
                   'name', s.name,
                   'tools', gm.tools_filter
                 )
               ) as servers
        FROM groups g
        LEFT JOIN group_members gm ON g.id = gm.group_id
        LEFT JOIN mcp_servers s ON gm.server_id = s.id
        GROUP BY g.id, g.name, g.description
      `);

      const groups: IGroup[] = groupsResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        servers: row.servers.filter((s: any) => s.name !== null),
      }));

      // Get users (admin only)
      let users: IUser[] = [];
      if (!user || user.isAdmin) {
        const usersResult = await client.query(`
          SELECT username, password_hash as password, email, is_admin
          FROM users
        `);
        users = usersResult.rows.map(row => ({
          username: row.username,
          password: row.password,
          email: row.email,
          isAdmin: row.is_admin,
        }));
      }

      return {
        mcpServers,
        groups,
        users,
        systemConfig,
      };
    } finally {
      client.release();
    }
  }

  // Save settings to database (replaces file-based saveSettings)
  public async saveSettings(settings: McpSettings, user?: IUser): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const userId = user ? await this.getUserId(user.username) : null;

      // Update system configuration
      if (settings.systemConfig) {
        for (const [key, value] of Object.entries(settings.systemConfig)) {
          await client.query(`
            INSERT INTO system_config (config_key, config_value, updated_by)
            VALUES ($1, $2, $3)
            ON CONFLICT (config_key) 
            DO UPDATE SET config_value = $2, updated_at = CURRENT_TIMESTAMP, updated_by = $3
          `, [key, JSON.stringify(value), userId]);
        }
      }

      // Update MCP servers
      if (settings.mcpServers) {
        for (const [name, config] of Object.entries(settings.mcpServers)) {
          await client.query(`
            INSERT INTO mcp_servers (name, display_name, description, server_type, config, owner_id, is_enabled)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (name)
            DO UPDATE SET 
              display_name = $2,
              description = $3,
              server_type = $4,
              config = $5,
              is_enabled = $7,
              updated_at = CURRENT_TIMESTAMP
          `, [
            name,
            config.displayName || name,
            config.description || '',
            config.type || 'stdio',
            JSON.stringify(config),
            userId,
            config.enabled !== false,
          ]);
        }
      }

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error saving settings:', error);
      return false;
    } finally {
      client.release();
    }
  }

  // API Key Management
  public async createApiKey(name: string, userId: string, permissions: any = {}): Promise<string> {
    const apiKey = crypto.randomBytes(32).toString('hex');
    const keyHash = await bcrypt.hash(apiKey, 10);

    await this.pool.query(`
      INSERT INTO api_keys (key_hash, key_name, user_id, permissions, is_active)
      VALUES ($1, $2, $3, $4, $5)
    `, [keyHash, name, userId, JSON.stringify(permissions), true]);

    return apiKey;
  }

  public async validateApiKey(apiKey: string): Promise<{ valid: boolean; user?: IUser; permissions?: any }> {
    const result = await this.pool.query(`
      SELECT ak.key_hash, ak.permissions, ak.is_active,
             u.username, u.email, u.is_admin
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.is_active = true
    `);

    for (const row of result.rows) {
      const isValid = await bcrypt.compare(apiKey, row.key_hash);
      if (isValid && row.is_active) {
        // Update last_used timestamp
        await this.pool.query(`
          UPDATE api_keys SET last_used = CURRENT_TIMESTAMP 
          WHERE key_hash = $1
        `, [row.key_hash]);

        return {
          valid: true,
          user: {
            username: row.username,
            password: '', // Don't return password
            email: row.email,
            isAdmin: row.is_admin,
          },
          permissions: row.permissions,
        };
      }
    }

    return { valid: false };
  }

  public async revokeApiKey(keyHash: string): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE api_keys SET is_active = false 
      WHERE key_hash = $1
    `, [keyHash]);

    return result.rowCount > 0;
  }

  // User Management
  public async createUser(username: string, password: string, email?: string, isAdmin: boolean = false): Promise<boolean> {
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      await this.pool.query(`
        INSERT INTO users (username, password_hash, email, is_admin)
        VALUES ($1, $2, $3, $4)
      `, [username, passwordHash, email, isAdmin]);
      return true;
    } catch (error) {
      console.error('Error creating user:', error);
      return false;
    }
  }

  public async authenticateUser(username: string, password: string): Promise<IUser | null> {
    const result = await this.pool.query(`
      SELECT username, password_hash, email, is_admin
      FROM users
      WHERE username = $1
    `, [username]);

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (isValid) {
      // Update last login
      await this.pool.query(`
        UPDATE users SET last_login = CURRENT_TIMESTAMP 
        WHERE username = $1
      `, [username]);

      return {
        username: user.username,
        password: '', // Don't return password
        email: user.email,
        isAdmin: user.is_admin,
      };
    }

    return null;
  }

  private async getUserId(username: string): Promise<string | null> {
    const result = await this.pool.query(`
      SELECT id FROM users WHERE username = $1
    `, [username]);

    return result.rows.length > 0 ? result.rows[0].id : null;
  }

  // Connection and usage logging
  public async logConnection(serverId: string, userId?: string, sessionId?: string, status: string = 'connected'): Promise<void> {
    await this.pool.query(`
      INSERT INTO connection_logs (server_id, user_id, session_id, status, connected_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    `, [serverId, userId, sessionId, status]);
  }

  public async logToolUsage(serverId: string, toolName: string, userId?: string, sessionId?: string, inputData?: any, outputData?: any, executionTime?: number, status: string = 'success'): Promise<void> {
    await this.pool.query(`
      INSERT INTO tool_usage_logs (server_id, tool_name, user_id, session_id, input_data, output_data, execution_time_ms, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [serverId, toolName, userId, sessionId, JSON.stringify(inputData), JSON.stringify(outputData), executionTime, status]);
  }

  // Cleanup and maintenance
  public async cleanup(): Promise<void> {
    await this.pool.end();
  }

  // Health check
  public async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    try {
      const result = await this.pool.query('SELECT 1 as health');
      return {
        healthy: true,
        details: {
          connected: true,
          totalConnections: this.pool.totalCount,
          idleConnections: this.pool.idleCount,
          waitingConnections: this.pool.waitingCount,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: error.message },
      };
    }
  }
}

export default DatabaseService;

