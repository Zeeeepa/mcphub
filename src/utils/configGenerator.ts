import { McpSettings, ServerConfig } from '../types/index.js';
import { loadSettings, createApiKey } from '../config/database.js';

export interface ClientConfigOptions {
  domain?: string;
  port?: number;
  protocol?: 'http' | 'https';
  apiKey?: string;
  serverName?: string;
  groupName?: string;
  includeAllServers?: boolean;
  customEndpoint?: string;
}

export interface GeneratedClientConfig {
  mcpServers: {
    [key: string]: {
      type: string;
      url: string;
      keepAliveInterval?: number;
      owner?: string;
      env?: string;
      headers?: Record<string, string>;
    };
  };
}

export class ConfigGenerator {
  /**
   * Generate MCP client configuration for connecting to MCPhub
   */
  public static async generateClientConfig(options: ClientConfigOptions = {}): Promise<GeneratedClientConfig> {
    const {
      domain = 'localhost',
      port = 3000,
      protocol = domain === 'localhost' ? 'http' : 'https',
      apiKey,
      serverName = 'MCPhub',
      groupName,
      includeAllServers = false,
      customEndpoint,
    } = options;

    const settings = await loadSettings();
    const baseUrl = `${protocol}://${domain}${port && protocol === 'http' && port !== 80 ? `:${port}` : ''}`;
    
    const config: GeneratedClientConfig = {
      mcpServers: {},
    };

    if (includeAllServers) {
      // Generate configuration for all available MCP servers
      for (const [name, serverConfig] of Object.entries(settings.mcpServers || {})) {
        if (serverConfig.enabled !== false) {
          config.mcpServers[name] = this.generateServerConfig(baseUrl, serverConfig, apiKey, name);
        }
      }
    } else if (groupName) {
      // Generate configuration for a specific group
      const group = settings.groups?.find(g => g.name === groupName || g.id === groupName);
      if (group) {
        config.mcpServers[`${serverName}_${groupName}`] = {
          type: 'sse',
          url: `${baseUrl}/sse/${groupName}`,
          keepAliveInterval: 60000,
          owner: 'admin',
          ...(apiKey && { env: apiKey }),
        };
      }
    } else {
      // Generate configuration for MCPhub as a unified endpoint
      const endpoint = customEndpoint || '/sse';
      config.mcpServers[serverName] = {
        type: 'sse',
        url: `${baseUrl}${endpoint}`,
        keepAliveInterval: 60000,
        owner: 'admin',
        ...(apiKey && { env: apiKey }),
      };
    }

    return config;
  }

  /**
   * Generate configuration for a specific server
   */
  private static generateServerConfig(
    baseUrl: string,
    serverConfig: ServerConfig,
    apiKey?: string,
    serverName?: string
  ): any {
    const config: any = {
      type: 'sse',
      url: `${baseUrl}/sse/${serverName}`,
      keepAliveInterval: serverConfig.keepAliveInterval || 60000,
      owner: serverConfig.owner || 'admin',
    };

    if (apiKey) {
      config.env = apiKey;
    }

    if (serverConfig.headers) {
      config.headers = serverConfig.headers;
    }

    return config;
  }

  /**
   * Generate API key and client configuration in one step
   */
  public static async generateWithApiKey(
    username: string,
    keyName: string,
    options: ClientConfigOptions = {}
  ): Promise<{ apiKey: string; config: GeneratedClientConfig }> {
    // Generate API key
    const apiKey = await createApiKey(keyName, username, {
      servers: ['*'],
      groups: ['*'],
      admin: false,
    });

    // Generate client configuration with the API key
    const config = await this.generateClientConfig({
      ...options,
      apiKey,
    });

    return { apiKey, config };
  }

  /**
   * Generate configuration for different deployment scenarios
   */
  public static async generateForDeployment(
    deployment: 'local' | 'wsl2' | 'vps' | 'cloudflare',
    domain?: string,
    apiKey?: string
  ): Promise<GeneratedClientConfig> {
    const deploymentConfigs = {
      local: {
        domain: 'localhost',
        port: 3000,
        protocol: 'http' as const,
      },
      wsl2: {
        domain: 'localhost',
        port: 3000,
        protocol: 'http' as const,
      },
      vps: {
        domain: domain || 'your-server.com',
        protocol: 'https' as const,
      },
      cloudflare: {
        domain: domain || 'your-domain.com',
        protocol: 'https' as const,
      },
    };

    const config = deploymentConfigs[deployment];
    return this.generateClientConfig({
      ...config,
      apiKey,
    });
  }

  /**
   * Generate configuration with smart routing endpoint
   */
  public static async generateSmartRoutingConfig(
    options: ClientConfigOptions = {}
  ): Promise<GeneratedClientConfig> {
    return this.generateClientConfig({
      ...options,
      customEndpoint: '/sse/$smart',
      serverName: options.serverName || 'MCPhub_Smart',
    });
  }

  /**
   * Generate configuration for multiple environments
   */
  public static async generateMultiEnvironmentConfig(
    environments: Array<{
      name: string;
      domain: string;
      protocol?: 'http' | 'https';
      port?: number;
      apiKey?: string;
    }>
  ): Promise<GeneratedClientConfig> {
    const config: GeneratedClientConfig = {
      mcpServers: {},
    };

    for (const env of environments) {
      const envConfig = await this.generateClientConfig({
        domain: env.domain,
        protocol: env.protocol,
        port: env.port,
        apiKey: env.apiKey,
        serverName: `MCPhub_${env.name}`,
      });

      Object.assign(config.mcpServers, envConfig.mcpServers);
    }

    return config;
  }

  /**
   * Validate client configuration
   */
  public static validateConfig(config: GeneratedClientConfig): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
      errors.push('No MCP servers configured');
    }

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      if (!serverConfig.url) {
        errors.push(`Server '${name}' missing URL`);
      }

      if (!serverConfig.type) {
        warnings.push(`Server '${name}' missing type, defaulting to 'sse'`);
      }

      if (!serverConfig.env && !serverConfig.headers?.['Authorization']) {
        warnings.push(`Server '${name}' has no authentication configured`);
      }

      try {
        new URL(serverConfig.url);
      } catch {
        errors.push(`Server '${name}' has invalid URL: ${serverConfig.url}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Export configuration to different formats
   */
  public static exportConfig(
    config: GeneratedClientConfig,
    format: 'json' | 'yaml' | 'env' = 'json'
  ): string {
    switch (format) {
      case 'json':
        return JSON.stringify(config, null, 2);
      
      case 'yaml':
        return this.toYaml(config);
      
      case 'env':
        return this.toEnvVars(config);
      
      default:
        return JSON.stringify(config, null, 2);
    }
  }

  /**
   * Convert configuration to YAML format
   */
  private static toYaml(config: GeneratedClientConfig): string {
    let yaml = 'mcpServers:\n';
    
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      yaml += `  ${name}:\n`;
      yaml += `    type: "${serverConfig.type}"\n`;
      yaml += `    url: "${serverConfig.url}"\n`;
      
      if (serverConfig.keepAliveInterval) {
        yaml += `    keepAliveInterval: ${serverConfig.keepAliveInterval}\n`;
      }
      
      if (serverConfig.owner) {
        yaml += `    owner: "${serverConfig.owner}"\n`;
      }
      
      if (serverConfig.env) {
        yaml += `    env: "${serverConfig.env}"\n`;
      }
      
      if (serverConfig.headers) {
        yaml += `    headers:\n`;
        for (const [key, value] of Object.entries(serverConfig.headers)) {
          yaml += `      ${key}: "${value}"\n`;
        }
      }
    }
    
    return yaml;
  }

  /**
   * Convert configuration to environment variables
   */
  private static toEnvVars(config: GeneratedClientConfig): string {
    let envVars = '';
    
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      const prefix = `MCP_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
      
      envVars += `${prefix}_TYPE="${serverConfig.type}"\n`;
      envVars += `${prefix}_URL="${serverConfig.url}"\n`;
      
      if (serverConfig.keepAliveInterval) {
        envVars += `${prefix}_KEEP_ALIVE_INTERVAL="${serverConfig.keepAliveInterval}"\n`;
      }
      
      if (serverConfig.owner) {
        envVars += `${prefix}_OWNER="${serverConfig.owner}"\n`;
      }
      
      if (serverConfig.env) {
        envVars += `${prefix}_API_KEY="${serverConfig.env}"\n`;
      }
    }
    
    return envVars;
  }
}

export default ConfigGenerator;

