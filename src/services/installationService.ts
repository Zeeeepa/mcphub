import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { loadSettings, saveSettings } from '../config/index.js';
import { addServer } from './mcpService.js';

const exec = promisify(require('child_process').exec);

export interface InstallationResult {
  success: boolean;
  message: string;
  serverName?: string;
  error?: string;
}

export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  url: string;
  clonePath: string;
}

// Parse GitHub URL to extract owner and repo
export const parseGitHubUrl = (url: string): GitHubRepoInfo | null => {
  try {
    // Support various GitHub URL formats
    const patterns = [
      /^https:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/,
      /^git@github\.com:([^\/]+)\/([^\/]+?)(?:\.git)?$/,
      /^github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const owner = match[1];
        const repo = match[2];
        const clonePath = path.join(process.cwd(), 'temp_installs', `${owner}-${repo}-${Date.now()}`);
        
        return {
          owner,
          repo,
          url: `https://github.com/${owner}/${repo}.git`,
          clonePath,
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing GitHub URL:', error);
    return null;
  }
};

// Check if git is available
export const checkGitAvailable = async (): Promise<boolean> => {
  try {
    await exec('git --version');
    return true;
  } catch (error) {
    return false;
  }
};

// Check if Node.js is available
export const checkNodeAvailable = async (): Promise<boolean> => {
  try {
    await exec('node --version');
    return true;
  } catch (error) {
    return false;
  }
};

// Check if Python/uv is available
export const checkPythonAvailable = async (): Promise<boolean> => {
  try {
    await exec('python --version');
    return true;
  } catch (error) {
    try {
      await exec('python3 --version');
      return true;
    } catch (error2) {
      return false;
    }
  }
};

// Clone repository
export const cloneRepository = async (repoInfo: GitHubRepoInfo): Promise<boolean> => {
  try {
    // Ensure temp_installs directory exists
    const tempDir = path.dirname(repoInfo.clonePath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Clone the repository
    await exec(`git clone ${repoInfo.url} ${repoInfo.clonePath}`);
    
    return fs.existsSync(repoInfo.clonePath);
  } catch (error) {
    console.error('Error cloning repository:', error);
    return false;
  }
};

// Detect project type and build configuration
export const detectProjectType = (projectPath: string): 'node' | 'python' | 'unknown' => {
  if (fs.existsSync(path.join(projectPath, 'package.json'))) {
    return 'node';
  }
  
  if (fs.existsSync(path.join(projectPath, 'pyproject.toml')) || 
      fs.existsSync(path.join(projectPath, 'requirements.txt')) ||
      fs.existsSync(path.join(projectPath, 'setup.py'))) {
    return 'python';
  }
  
  return 'unknown';
};

// Build Node.js project
export const buildNodeProject = async (projectPath: string): Promise<boolean> => {
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return false;
    }

    // Install dependencies
    await exec('npm install', { cwd: projectPath });
    
    // Check if there's a build script
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (packageJson.scripts && packageJson.scripts.build) {
      await exec('npm run build', { cwd: projectPath });
    }
    
    return true;
  } catch (error) {
    console.error('Error building Node.js project:', error);
    return false;
  }
};

// Build Python project
export const buildPythonProject = async (projectPath: string): Promise<boolean> => {
  try {
    // Try to install dependencies
    if (fs.existsSync(path.join(projectPath, 'requirements.txt'))) {
      await exec('pip install -r requirements.txt', { cwd: projectPath });
    } else if (fs.existsSync(path.join(projectPath, 'pyproject.toml'))) {
      await exec('pip install .', { cwd: projectPath });
    }
    
    return true;
  } catch (error) {
    console.error('Error building Python project:', error);
    return false;
  }
};

// Extract server configuration from project
export const extractServerConfig = (projectPath: string, projectType: 'node' | 'python'): any => {
  try {
    if (projectType === 'node') {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // Look for main entry point
        const mainFile = packageJson.main || 'index.js';
        const mainPath = path.resolve(projectPath, mainFile);
        
        return {
          command: 'node',
          args: [mainPath],
          type: 'stdio',
          description: `Installed from GitHub: ${packageJson.name || 'Unknown'}`,
          version: packageJson.version || '1.0.0',
        };
      }
    } else if (projectType === 'python') {
      // Look for common Python MCP server patterns
      const commonFiles = ['server.py', 'main.py', '__main__.py', 'app.py'];
      
      for (const file of commonFiles) {
        const filePath = path.join(projectPath, file);
        if (fs.existsSync(filePath)) {
          return {
            command: 'python',
            args: [filePath],
            type: 'stdio',
            description: 'Installed from GitHub (Python)',
            version: '1.0.0',
          };
        }
      }
      
      // Check for pyproject.toml
      const pyprojectPath = path.join(projectPath, 'pyproject.toml');
      if (fs.existsSync(pyprojectPath)) {
        return {
          command: 'python',
          args: ['-m', path.basename(projectPath)],
          type: 'stdio',
          description: 'Installed from GitHub (Python module)',
          version: '1.0.0',
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting server config:', error);
    return null;
  }
};

// Clean up temporary files
export const cleanupTempFiles = (projectPath: string): void => {
  try {
    if (fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
  }
};

// Main installation function
export const installFromGitHub = async (
  githubUrl: string,
  serverName?: string,
  owner?: string
): Promise<InstallationResult> => {
  let tempPath: string | null = null;
  
  try {
    // Parse GitHub URL
    const repoInfo = parseGitHubUrl(githubUrl);
    if (!repoInfo) {
      return {
        success: false,
        message: 'Invalid GitHub URL format',
        error: 'URL_PARSE_ERROR',
      };
    }

    tempPath = repoInfo.clonePath;

    // Check prerequisites
    if (!(await checkGitAvailable())) {
      return {
        success: false,
        message: 'Git is not available. Please install Git to use GitHub installation.',
        error: 'GIT_NOT_AVAILABLE',
      };
    }

    // Clone repository
    const cloned = await cloneRepository(repoInfo);
    if (!cloned) {
      return {
        success: false,
        message: 'Failed to clone repository. Please check the URL and try again.',
        error: 'CLONE_FAILED',
      };
    }

    // Detect project type
    const projectType = detectProjectType(repoInfo.clonePath);
    if (projectType === 'unknown') {
      return {
        success: false,
        message: 'Unable to detect project type. Only Node.js and Python projects are supported.',
        error: 'UNKNOWN_PROJECT_TYPE',
      };
    }

    // Check runtime availability
    if (projectType === 'node' && !(await checkNodeAvailable())) {
      return {
        success: false,
        message: 'Node.js is not available. Please install Node.js to run this server.',
        error: 'NODE_NOT_AVAILABLE',
      };
    }

    if (projectType === 'python' && !(await checkPythonAvailable())) {
      return {
        success: false,
        message: 'Python is not available. Please install Python to run this server.',
        error: 'PYTHON_NOT_AVAILABLE',
      };
    }

    // Build project
    let buildSuccess = false;
    if (projectType === 'node') {
      buildSuccess = await buildNodeProject(repoInfo.clonePath);
    } else if (projectType === 'python') {
      buildSuccess = await buildPythonProject(repoInfo.clonePath);
    }

    if (!buildSuccess) {
      return {
        success: false,
        message: `Failed to build ${projectType} project. Please check the project configuration.`,
        error: 'BUILD_FAILED',
      };
    }

    // Extract server configuration
    const serverConfig = extractServerConfig(repoInfo.clonePath, projectType);
    if (!serverConfig) {
      return {
        success: false,
        message: 'Unable to determine server configuration. Please check the project structure.',
        error: 'CONFIG_EXTRACTION_FAILED',
      };
    }

    // Generate server name if not provided
    const finalServerName = serverName || `${repoInfo.owner}-${repoInfo.repo}`;

    // Add owner if provided
    if (owner) {
      serverConfig.owner = owner;
    }

    // Move project to permanent location
    const permanentPath = path.join(process.cwd(), 'installed_servers', finalServerName);
    if (fs.existsSync(permanentPath)) {
      fs.rmSync(permanentPath, { recursive: true, force: true });
    }
    
    const permanentDir = path.dirname(permanentPath);
    if (!fs.existsSync(permanentDir)) {
      fs.mkdirSync(permanentDir, { recursive: true });
    }
    
    fs.renameSync(repoInfo.clonePath, permanentPath);

    // Update server config with permanent path
    if (projectType === 'node') {
      const packageJsonPath = path.join(permanentPath, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const mainFile = packageJson.main || 'index.js';
      serverConfig.args = [path.resolve(permanentPath, mainFile)];
    } else if (projectType === 'python') {
      // Update Python paths
      const originalArgs = serverConfig.args;
      if (originalArgs && originalArgs.length > 0 && !originalArgs[0].startsWith('-')) {
        serverConfig.args = [path.resolve(permanentPath, originalArgs[0])];
      }
    }

    // Add server to configuration
    const result = await addServer(finalServerName, serverConfig);
    if (!result.success) {
      return {
        success: false,
        message: result.message || 'Failed to add server to configuration',
        error: 'ADD_SERVER_FAILED',
      };
    }

    return {
      success: true,
      message: `Successfully installed MCP server "${finalServerName}" from GitHub`,
      serverName: finalServerName,
    };

  } catch (error) {
    console.error('Error during GitHub installation:', error);
    return {
      success: false,
      message: 'An unexpected error occurred during installation',
      error: 'UNEXPECTED_ERROR',
    };
  } finally {
    // Clean up temporary files
    if (tempPath && fs.existsSync(tempPath)) {
      cleanupTempFiles(tempPath);
    }
  }
};
