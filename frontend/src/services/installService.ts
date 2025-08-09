import { ApiResponse } from '@/types';

export interface InstallRequest {
  url: string;
}

export interface InstallResponse {
  success: boolean;
  message: string;
  servers?: string[];
  projectPath?: string;
  metadata?: {
    name?: string;
    description?: string;
    version?: string;
    author?: string;
  };
}

export interface InstalledServer {
  name: string;
  config: any;
  sourceRepository: string;
  projectPath: string;
  installDate: string;
}

export interface InstallationStatus {
  totalRepositories: number;
  repositories: Array<{
    name: string;
    url: string;
    clonedAt: string;
    projectPath: string;
  }>;
  installedServers: Array<{
    name: string;
    sourceRepository?: string;
    installDate?: string;
  }>;
}

/**
 * Install a server from a GitHub repository
 */
export const installFromGitHub = async (url: string): Promise<InstallResponse> => {
  try {
    const response = await fetch('/api/servers/install', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ url }),
    });

    const result: ApiResponse<InstallResponse> = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || 'Installation failed');
    }

    return result.data || {
      success: true,
      message: 'Installation completed successfully'
    };
  } catch (error: any) {
    console.error('Error installing from GitHub:', error);
    throw new Error(error.message || 'Installation failed');
  }
};

/**
 * Uninstall a server that was installed from GitHub
 */
export const uninstallServer = async (serverName: string): Promise<void> => {
  try {
    const response = await fetch(`/api/servers/uninstall/${encodeURIComponent(serverName)}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    const result: ApiResponse = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || 'Uninstallation failed');
    }
  } catch (error: any) {
    console.error('Error uninstalling server:', error);
    throw new Error(error.message || 'Uninstallation failed');
  }
};

/**
 * Get all installed servers for the current user
 */
export const getInstalledServers = async (): Promise<InstalledServer[]> => {
  try {
    const response = await fetch('/api/servers/installed', {
      method: 'GET',
      credentials: 'include',
    });

    const result: ApiResponse<InstalledServer[]> = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || 'Failed to get installed servers');
    }

    return result.data || [];
  } catch (error: any) {
    console.error('Error getting installed servers:', error);
    throw new Error(error.message || 'Failed to get installed servers');
  }
};

/**
 * Get installation status and repository information
 */
export const getInstallationStatus = async (): Promise<InstallationStatus> => {
  try {
    const response = await fetch('/api/installation/status', {
      method: 'GET',
      credentials: 'include',
    });

    const result: ApiResponse<InstallationStatus> = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || 'Failed to get installation status');
    }

    return result.data || {
      totalRepositories: 0,
      repositories: [],
      installedServers: []
    };
  } catch (error: any) {
    console.error('Error getting installation status:', error);
    throw new Error(error.message || 'Failed to get installation status');
  }
};

/**
 * Validates if a URL is a valid GitHub repository URL
 */
export const validateGitHubUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    
    // Check if it's a GitHub URL
    if (urlObj.hostname !== 'github.com') {
      return false;
    }
    
    // Check if it has the correct path format (owner/repo)
    const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
    if (pathParts.length < 2) {
      return false;
    }
    
    // Remove .git suffix if present
    const repoName = pathParts[1].replace(/\.git$/, '');
    return repoName.length > 0;
  } catch {
    return false;
  }
};

export default {
  installFromGitHub,
  uninstallServer,
  getInstalledServers,
  getInstallationStatus,
  validateGitHubUrl
};
