import fs from 'fs/promises';
import path from 'path';
import { ServerConfig } from '../types/index.js';

export interface ExtractedConfig {
  servers: Record<string, ServerConfig>;
  metadata?: {
    name?: string;
    description?: string;
    version?: string;
    author?: string;
  };
}

export interface ExtractionResult {
  success: boolean;
  config?: ExtractedConfig;
  error?: string;
}

/**
 * Extracts MCP server configuration from a Node.js package.json file
 */
const extractFromPackageJson = async (projectPath: string): Promise<ExtractedConfig | null> => {
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);
    
    // Look for mcpServers configuration
    if (packageJson.mcpServers && typeof packageJson.mcpServers === 'object') {
      return {
        servers: packageJson.mcpServers,
        metadata: {
          name: packageJson.name,
          description: packageJson.description,
          version: packageJson.version,
          author: typeof packageJson.author === 'string' ? packageJson.author : packageJson.author?.name
        }
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting from package.json:', error);
    return null;
  }
};

/**
 * Extracts MCP server configuration from a Python pyproject.toml file
 */
const extractFromPyprojectToml = async (projectPath: string): Promise<ExtractedConfig | null> => {
  try {
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    const content = await fs.readFile(pyprojectPath, 'utf-8');
    
    // Simple TOML parsing for mcpServers section
    // This is a basic implementation - for production, consider using a proper TOML parser
    const mcpServersMatch = content.match(/\[tool\.mcpServers\]([\s\S]*?)(?=\n\[|\n$|$)/);
    if (!mcpServersMatch) {
      return null;
    }
    
    // Extract project metadata
    const projectMatch = content.match(/\[project\]([\s\S]*?)(?=\n\[|\n$|$)/);
    let metadata = {};
    
    if (projectMatch) {
      const projectSection = projectMatch[1];
      const nameMatch = projectSection.match(/name\s*=\s*"([^"]+)"/);
      const descMatch = projectSection.match(/description\s*=\s*"([^"]+)"/);
      const versionMatch = projectSection.match(/version\s*=\s*"([^"]+)"/);
      
      metadata = {
        name: nameMatch?.[1],
        description: descMatch?.[1],
        version: versionMatch?.[1]
      };
    }
    
    // For now, return empty servers object - full TOML parsing would be needed for complex configs
    // This is a placeholder for the basic structure
    return {
      servers: {},
      metadata
    };
  } catch (error) {
    console.error('Error extracting from pyproject.toml:', error);
    return null;
  }
};

/**
 * Extracts MCP server configuration from a dedicated mcphub.json file
 */
const extractFromMcphubJson = async (projectPath: string): Promise<ExtractedConfig | null> => {
  try {
    const mcphubJsonPath = path.join(projectPath, 'mcphub.json');
    const content = await fs.readFile(mcphubJsonPath, 'utf-8');
    const config = JSON.parse(content);
    
    if (config.mcpServers && typeof config.mcpServers === 'object') {
      return {
        servers: config.mcpServers,
        metadata: {
          name: config.name,
          description: config.description,
          version: config.version,
          author: config.author
        }
      };
    }
    
    return null;
  } catch (error) {
    // mcphub.json is optional, so don't log errors for missing files
    if ((error as any).code !== 'ENOENT') {
      console.error('Error extracting from mcphub.json:', error);
    }
    return null;
  }
};

/**
 * Extracts MCP server configuration from a README.md file
 * Looks for code blocks with MCP configuration
 */
const extractFromReadme = async (projectPath: string): Promise<ExtractedConfig | null> => {
  try {
    const readmePath = path.join(projectPath, 'README.md');
    const content = await fs.readFile(readmePath, 'utf-8');
    
    // Look for JSON code blocks that might contain MCP configuration
    const jsonBlocks = content.match(/```json\s*([\s\S]*?)\s*```/g);
    
    if (jsonBlocks) {
      for (const block of jsonBlocks) {
        try {
          const jsonContent = block.replace(/```json\s*/, '').replace(/\s*```/, '');
          const parsed = JSON.parse(jsonContent);
          
          // Check if this looks like an MCP configuration
          if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
            return {
              servers: parsed.mcpServers,
              metadata: {
                name: parsed.name,
                description: parsed.description,
                version: parsed.version
              }
            };
          }
        } catch {
          // Skip invalid JSON blocks
          continue;
        }
      }
    }
    
    return null;
  } catch (error) {
    // README.md is optional
    if ((error as any).code !== 'ENOENT') {
      console.error('Error extracting from README.md:', error);
    }
    return null;
  }
};

/**
 * Validates that server configurations only use local commands (no Docker/HTTP)
 */
const validateLocalCommands = (servers: Record<string, ServerConfig>): boolean => {
  for (const [serverName, config] of Object.entries(servers)) {
    // Only allow stdio type servers with local commands
    if (config.type && config.type !== 'stdio') {
      console.warn(`Server ${serverName} uses non-local type: ${config.type}`);
      return false;
    }
    
    // Check for Docker commands
    if (config.command && (
      config.command.includes('docker') || 
      config.command.includes('podman') ||
      config.command.includes('http://') ||
      config.command.includes('https://')
    )) {
      console.warn(`Server ${serverName} uses non-local command: ${config.command}`);
      return false;
    }
    
    // Check args for Docker/HTTP references
    if (config.args) {
      for (const arg of config.args) {
        if (typeof arg === 'string' && (
          arg.includes('docker') ||
          arg.includes('podman') ||
          arg.includes('http://') ||
          arg.includes('https://')
        )) {
          console.warn(`Server ${serverName} has non-local argument: ${arg}`);
          return false;
        }
      }
    }
  }
  
  return true;
};

/**
 * Main function to extract MCP server configuration from a project
 */
export const extractConfiguration = async (projectPath: string): Promise<ExtractionResult> => {
  try {
    console.log(`Extracting configuration from ${projectPath}`);
    
    // Try different configuration sources in order of preference
    const extractors = [
      extractFromMcphubJson,    // Dedicated config file (highest priority)
      extractFromPackageJson,  // Node.js projects
      extractFromPyprojectToml, // Python projects
      extractFromReadme        // Fallback to README
    ];
    
    for (const extractor of extractors) {
      const result = await extractor(projectPath);
      if (result && result.servers && Object.keys(result.servers).length > 0) {
        // Validate that all servers use local commands only
        if (!validateLocalCommands(result.servers)) {
          return {
            success: false,
            error: 'Configuration contains non-local servers (Docker, HTTP, etc.). Only local command-based servers are supported.'
          };
        }
        
        console.log(`Successfully extracted ${Object.keys(result.servers).length} server(s) from ${projectPath}`);
        return {
          success: true,
          config: result
        };
      }
    }
    
    return {
      success: false,
      error: 'No MCP server configuration found. Please ensure your project includes mcpServers configuration in package.json, pyproject.toml, mcphub.json, or README.md'
    };
  } catch (error: any) {
    console.error('Error extracting configuration:', error);
    return {
      success: false,
      error: `Configuration extraction failed: ${error.message}`
    };
  }
};

/**
 * Validates a server configuration object
 */
export const validateServerConfig = (config: ServerConfig): boolean => {
  // Must have a command for stdio servers
  if (!config.command) {
    return false;
  }
  
  // Must not use non-local types
  if (config.type && config.type !== 'stdio') {
    return false;
  }
  
  return true;
};

/**
 * Sanitizes server names to ensure they're valid identifiers
 */
export const sanitizeServerName = (name: string): string => {
  return name
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
};

export default {
  extractConfiguration,
  validateServerConfig,
  sanitizeServerName
};
