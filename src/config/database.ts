import { DatabaseService } from '../services/databaseService.js';
import { McpSettings, IUser } from '../types/index.js';

// Database-backed configuration service that replaces file-based config
class DatabaseConfig {
  private dbService: DatabaseService;
  private settingsCache: McpSettings | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 30000; // 30 seconds cache TTL

  constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  public async initialize(): Promise<void> {
    await this.dbService.initialize();
  }

  public async loadSettings(user?: IUser): Promise<McpSettings> {
    // Check cache first
    if (this.settingsCache && Date.now() < this.cacheExpiry) {
      return this.filterSettingsForUser(this.settingsCache, user);
    }

    try {
      const settings = await this.dbService.loadSettings(user);
      
      // Update cache
      this.settingsCache = settings;
      this.cacheExpiry = Date.now() + this.CACHE_TTL;
      
      return this.filterSettingsForUser(settings, user);
    } catch (error) {
      console.error('Failed to load settings from database:', error);
      
      // Return minimal fallback settings
      return {
        mcpServers: {},
        users: [],
        groups: [],
        systemConfig: {
          routing: {
            enableGlobalRoute: true,
            enableGroupNameRoute: true,
            enableBearerAuth: false,
            bearerAuthKey: '',
            skipAuth: false,
          },
        },
      };
    }
  }

  public async saveSettings(settings: McpSettings, user?: IUser): Promise<boolean> {
    try {
      const success = await this.dbService.saveSettings(settings, user);
      
      if (success) {
        // Clear cache to force reload
        this.clearCache();
      }
      
      return success;
    } catch (error) {
      console.error('Failed to save settings to database:', error);
      return false;
    }
  }

  public clearCache(): void {
    this.settingsCache = null;
    this.cacheExpiry = 0;
  }

  public getCacheInfo(): { hasCache: boolean; expiresIn: number } {
    return {
      hasCache: this.settingsCache !== null,
      expiresIn: Math.max(0, this.cacheExpiry - Date.now()),
    };
  }

  // Filter settings based on user permissions
  private filterSettingsForUser(settings: McpSettings, user?: IUser): McpSettings {
    if (!user || user.isAdmin) {
      return settings;
    }

    // Non-admin users get filtered view
    const filteredSettings: McpSettings = {
      mcpServers: {},
      groups: settings.groups || [],
      users: [], // Non-admin users can't see user list
      systemConfig: {
        // Only expose safe system config to non-admin users
        routing: settings.systemConfig?.routing ? {
          enableGlobalRoute: settings.systemConfig.routing.enableGlobalRoute,
          enableGroupNameRoute: settings.systemConfig.routing.enableGroupNameRoute,
          enableBearerAuth: settings.systemConfig.routing.enableBearerAuth,
          bearerAuthKey: '', // Don't expose the actual key
          skipAuth: settings.systemConfig.routing.skipAuth,
        } : undefined,
      },
    };

    // Filter servers - only show servers owned by the user or public servers
    if (settings.mcpServers) {
      for (const [name, config] of Object.entries(settings.mcpServers)) {
        if (config.owner === user.username || config.owner === 'public') {
          filteredSettings.mcpServers[name] = config;
        }
      }
    }

    return filteredSettings;
  }

  // API Key management methods
  public async createApiKey(name: string, username: string, permissions: any = {}): Promise<string> {
    const userId = await this.getUserId(username);
    if (!userId) {
      throw new Error('User not found');
    }
    return await this.dbService.createApiKey(name, userId, permissions);
  }

  public async validateApiKey(apiKey: string): Promise<{ valid: boolean; user?: IUser; permissions?: any }> {
    return await this.dbService.validateApiKey(apiKey);
  }

  public async revokeApiKey(keyHash: string): Promise<boolean> {
    return await this.dbService.revokeApiKey(keyHash);
  }

  // User management methods
  public async createUser(username: string, password: string, email?: string, isAdmin: boolean = false): Promise<boolean> {
    const success = await this.dbService.createUser(username, password, email, isAdmin);
    if (success) {
      this.clearCache(); // Clear cache to reflect new user
    }
    return success;
  }

  public async authenticateUser(username: string, password: string): Promise<IUser | null> {
    return await this.dbService.authenticateUser(username, password);
  }

  private async getUserId(username: string): Promise<string | null> {
    // This is a helper method - in a real implementation, you'd want to cache this
    const settings = await this.loadSettings();
    const user = settings.users?.find(u => u.username === username);
    return user ? username : null; // Simplified - in real DB, you'd return the actual UUID
  }

  // Logging methods
  public async logConnection(serverId: string, userId?: string, sessionId?: string, status: string = 'connected'): Promise<void> {
    await this.dbService.logConnection(serverId, userId, sessionId, status);
  }

  public async logToolUsage(serverId: string, toolName: string, userId?: string, sessionId?: string, inputData?: any, outputData?: any, executionTime?: number, status: string = 'success'): Promise<void> {
    await this.dbService.logToolUsage(serverId, toolName, userId, sessionId, inputData, outputData, executionTime, status);
  }

  // Health check
  public async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    return await this.dbService.healthCheck();
  }

  // Cleanup
  public async cleanup(): Promise<void> {
    await this.dbService.cleanup();
  }
}

// Create singleton instance
const databaseConfig = new DatabaseConfig();

// Export functions that match the original file-based API
export const loadSettings = (user?: IUser): Promise<McpSettings> => {
  return databaseConfig.loadSettings(user);
};

export const saveSettings = (settings: McpSettings, user?: IUser): Promise<boolean> => {
  return databaseConfig.saveSettings(settings, user);
};

export const clearSettingsCache = (): void => {
  databaseConfig.clearCache();
};

export const getSettingsCacheInfo = (): { hasCache: boolean; expiresIn: number } => {
  return databaseConfig.getCacheInfo();
};

export const initializeDatabase = (): Promise<void> => {
  return databaseConfig.initialize();
};

// Export additional database-specific functions
export const createApiKey = (name: string, username: string, permissions: any = {}): Promise<string> => {
  return databaseConfig.createApiKey(name, username, permissions);
};

export const validateApiKey = (apiKey: string): Promise<{ valid: boolean; user?: IUser; permissions?: any }> => {
  return databaseConfig.validateApiKey(apiKey);
};

export const revokeApiKey = (keyHash: string): Promise<boolean> => {
  return databaseConfig.revokeApiKey(keyHash);
};

export const createUser = (username: string, password: string, email?: string, isAdmin: boolean = false): Promise<boolean> => {
  return databaseConfig.createUser(username, password, email, isAdmin);
};

export const authenticateUser = (username: string, password: string): Promise<IUser | null> => {
  return databaseConfig.authenticateUser(username, password);
};

export const logConnection = (serverId: string, userId?: string, sessionId?: string, status: string = 'connected'): Promise<void> => {
  return databaseConfig.logConnection(serverId, userId, sessionId, status);
};

export const logToolUsage = (serverId: string, toolName: string, userId?: string, sessionId?: string, inputData?: any, outputData?: any, executionTime?: number, status: string = 'success'): Promise<void> => {
  return databaseConfig.logToolUsage(serverId, toolName, userId, sessionId, inputData, outputData, executionTime, status);
};

export const databaseHealthCheck = (): Promise<{ healthy: boolean; details?: any }> => {
  return databaseConfig.healthCheck();
};

export const cleanupDatabase = (): Promise<void> => {
  return databaseConfig.cleanup();
};

export default databaseConfig;

