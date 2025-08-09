import { Request, Response } from 'express';
import { ApiResponse, ServerConfig } from '../types/index.js';
import { cloneRepository, buildProject, removeRepository, listRepositories } from '../services/repositoryService.js';
import { extractConfiguration } from '../services/configExtractor.js';
import { loadSettings, saveSettings } from '../config/index.js';
import path from 'path';

export interface InstallRequest {
  url: string;
}

export interface InstallResponse {
  success: boolean;
  message: string;
  servers?: string[];
  error?: string;
}

export interface InstalledServer {
  name: string;
  config: ServerConfig;
  sourceRepository: string;
  projectPath: string;
  installDate: string;
}

/**
 * Install a server from a GitHub repository
 */
export const installFromGitHub = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      } as ApiResponse);
      return;
    }

    const { url }: InstallRequest = req.body;
    
    if (!url || typeof url !== 'string') {
      res.status(400).json({
        success: false,
        message: 'GitHub repository URL is required',
      } as ApiResponse);
      return;
    }

    console.log(`Installing server from GitHub: ${url}`);

    // Step 1: Clone the repository
    const cloneResult = await cloneRepository(url);
    if (!cloneResult.success || !cloneResult.projectPath) {
      res.status(400).json({
        success: false,
        message: cloneResult.error || 'Failed to clone repository',
      } as ApiResponse);
      return;
    }

    const projectPath = cloneResult.projectPath;
    
    try {
      // Step 2: Build the project
      console.log('Building project...');
      const buildResult = await buildProject(projectPath);
      if (!buildResult.success) {
        // Clean up on build failure
        await removeRepository(projectPath);
        res.status(400).json({
          success: false,
          message: `Build failed: ${buildResult.error}`,
        } as ApiResponse);
        return;
      }

      // Step 3: Extract configuration
      console.log('Extracting configuration...');
      const configResult = await extractConfiguration(projectPath);
      if (!configResult.success || !configResult.config) {
        // Clean up on config extraction failure
        await removeRepository(projectPath);
        res.status(400).json({
          success: false,
          message: configResult.error || 'Failed to extract server configuration',
        } as ApiResponse);
        return;
      }

      // Step 4: Add servers to configuration
      const settings = loadSettings();
      if (!settings.servers) {
        settings.servers = {};
      }

      const installedServers: string[] = [];
      const installDate = new Date().toISOString();

      for (const [serverName, serverConfig] of Object.entries(configResult.config.servers)) {
        // Create a unique server name to avoid conflicts
        const uniqueServerName = `${serverName}-${Date.now()}`;
        
        // Mark as installed server
        const enhancedConfig: ServerConfig = {
          ...serverConfig,
          isInstalled: true,
          sourceRepository: url,
          projectPath: projectPath,
          installDate: installDate,
          owner: user.username,
          enabled: true
        };

        settings.servers[uniqueServerName] = enhancedConfig;
        installedServers.push(uniqueServerName);
        
        console.log(`Added server: ${uniqueServerName}`);
      }

      // Save updated settings
      saveSettings(settings);

      console.log(`Successfully installed ${installedServers.length} server(s) from ${url}`);

      res.json({
        success: true,
        message: `Successfully installed ${installedServers.length} server(s)`,
        data: {
          servers: installedServers,
          projectPath: projectPath,
          metadata: configResult.config.metadata
        }
      } as ApiResponse);

    } catch (error) {
      // Clean up on any error
      console.error('Error during installation process:', error);
      await removeRepository(projectPath);
      throw error;
    }

  } catch (error: any) {
    console.error('Error installing from GitHub:', error);
    res.status(500).json({
      success: false,
      message: `Installation failed: ${error.message}`,
    } as ApiResponse);
  }
};

/**
 * Uninstall a server that was installed from GitHub
 */
export const uninstallServer = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      } as ApiResponse);
      return;
    }

    const { serverName } = req.params;
    
    if (!serverName) {
      res.status(400).json({
        success: false,
        message: 'Server name is required',
      } as ApiResponse);
      return;
    }

    console.log(`Uninstalling server: ${serverName}`);

    const settings = loadSettings();
    
    if (!settings.servers || !settings.servers[serverName]) {
      res.status(404).json({
        success: false,
        message: 'Server not found',
      } as ApiResponse);
      return;
    }

    const serverConfig = settings.servers[serverName];
    
    // Check if this is an installed server
    if (!serverConfig.isInstalled) {
      res.status(400).json({
        success: false,
        message: 'Server was not installed from GitHub',
      } as ApiResponse);
      return;
    }

    // Check ownership
    if (serverConfig.owner !== user.username && !user.isAdmin) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to uninstall this server',
      } as ApiResponse);
      return;
    }

    // Remove the project directory if it exists
    if (serverConfig.projectPath) {
      const removeSuccess = await removeRepository(serverConfig.projectPath);
      if (!removeSuccess) {
        console.warn(`Failed to remove project directory: ${serverConfig.projectPath}`);
      }
    }

    // Remove server from configuration
    delete settings.servers[serverName];
    saveSettings(settings);

    console.log(`Successfully uninstalled server: ${serverName}`);

    res.json({
      success: true,
      message: 'Server uninstalled successfully',
    } as ApiResponse);

  } catch (error: any) {
    console.error('Error uninstalling server:', error);
    res.status(500).json({
      success: false,
      message: `Uninstallation failed: ${error.message}`,
    } as ApiResponse);
  }
};

/**
 * Get all installed servers for the current user
 */
export const getInstalledServers = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      } as ApiResponse);
      return;
    }

    const settings = loadSettings();
    const installedServers: InstalledServer[] = [];

    if (settings.servers) {
      for (const [serverName, serverConfig] of Object.entries(settings.servers)) {
        if (serverConfig.isInstalled && (serverConfig.owner === user.username || user.isAdmin)) {
          installedServers.push({
            name: serverName,
            config: serverConfig,
            sourceRepository: serverConfig.sourceRepository || '',
            projectPath: serverConfig.projectPath || '',
            installDate: serverConfig.installDate || ''
          });
        }
      }
    }

    res.json({
      success: true,
      data: installedServers,
    } as ApiResponse<InstalledServer[]>);

  } catch (error: any) {
    console.error('Error getting installed servers:', error);
    res.status(500).json({
      success: false,
      message: `Failed to get installed servers: ${error.message}`,
    } as ApiResponse);
  }
};

/**
 * Get installation status and repository information
 */
export const getInstallationStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const repositories = await listRepositories();
    const settings = loadSettings();
    
    const status = {
      totalRepositories: repositories.length,
      repositories: repositories.map(repo => ({
        name: repo.name,
        url: repo.url,
        clonedAt: repo.clonedAt,
        projectPath: repo.projectPath
      })),
      installedServers: Object.entries(settings.servers || {})
        .filter(([_, config]) => config.isInstalled)
        .map(([name, config]) => ({
          name,
          sourceRepository: config.sourceRepository,
          installDate: config.installDate
        }))
    };

    res.json({
      success: true,
      data: status,
    } as ApiResponse);

  } catch (error: any) {
    console.error('Error getting installation status:', error);
    res.status(500).json({
      success: false,
      message: `Failed to get installation status: ${error.message}`,
    } as ApiResponse);
  }
};

export default {
  installFromGitHub,
  uninstallServer,
  getInstalledServers,
  getInstallationStatus
};
