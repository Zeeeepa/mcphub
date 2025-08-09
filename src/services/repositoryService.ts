import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the root directory of the mcphub project
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const PROJECTS_DIR = path.join(PROJECT_ROOT, 'PROJECTS');

export interface RepositoryInfo {
  url: string;
  name: string;
  projectPath: string;
  clonedAt: string;
}

export interface CloneResult {
  success: boolean;
  projectPath?: string;
  error?: string;
}

export interface BuildResult {
  success: boolean;
  output?: string;
  error?: string;
}

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

/**
 * Extracts repository name from GitHub URL
 */
export const extractRepoName = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
    const repoName = pathParts[1].replace(/\.git$/, '');
    return `${pathParts[0]}-${repoName}`;
  } catch {
    throw new Error('Invalid GitHub URL');
  }
};

/**
 * Ensures the PROJECTS directory exists
 */
export const ensureProjectsDirectory = async (): Promise<void> => {
  try {
    await fs.access(PROJECTS_DIR);
  } catch {
    await fs.mkdir(PROJECTS_DIR, { recursive: true });
  }
};

/**
 * Clones a GitHub repository to the PROJECTS directory
 */
export const cloneRepository = async (url: string): Promise<CloneResult> => {
  try {
    if (!validateGitHubUrl(url)) {
      return {
        success: false,
        error: 'Invalid GitHub URL. Please provide a valid GitHub repository URL.'
      };
    }

    await ensureProjectsDirectory();
    
    const repoName = extractRepoName(url);
    const projectPath = path.join(PROJECTS_DIR, repoName);
    
    // Check if directory already exists
    try {
      await fs.access(projectPath);
      return {
        success: false,
        error: `Repository already exists at ${projectPath}. Please uninstall the existing version first.`
      };
    } catch {
      // Directory doesn't exist, which is what we want
    }
    
    // Clone the repository
    console.log(`Cloning repository ${url} to ${projectPath}`);
    const { stdout, stderr } = await execAsync(`git clone "${url}" "${projectPath}"`, {
      timeout: 60000 // 60 second timeout
    });
    
    if (stderr && !stderr.includes('Cloning into')) {
      console.error('Git clone stderr:', stderr);
    }
    
    console.log('Clone completed:', stdout);
    
    return {
      success: true,
      projectPath
    };
  } catch (error: any) {
    console.error('Error cloning repository:', error);
    return {
      success: false,
      error: `Failed to clone repository: ${error.message}`
    };
  }
};

/**
 * Removes a cloned repository from the PROJECTS directory
 */
export const removeRepository = async (projectPath: string): Promise<boolean> => {
  try {
    // Ensure the path is within PROJECTS directory for security
    const normalizedPath = path.resolve(projectPath);
    const normalizedProjectsDir = path.resolve(PROJECTS_DIR);
    
    if (!normalizedPath.startsWith(normalizedProjectsDir)) {
      console.error('Attempted to remove directory outside PROJECTS folder:', projectPath);
      return false;
    }
    
    await fs.rm(normalizedPath, { recursive: true, force: true });
    console.log(`Removed repository at ${projectPath}`);
    return true;
  } catch (error) {
    console.error('Error removing repository:', error);
    return false;
  }
};

/**
 * Detects the project type based on files in the repository
 */
export const detectProjectType = async (projectPath: string): Promise<string | null> => {
  try {
    const files = await fs.readdir(projectPath);
    
    // Check for Node.js project
    if (files.includes('package.json')) {
      return 'nodejs';
    }
    
    // Check for Python project
    if (files.includes('pyproject.toml') || files.includes('setup.py') || files.includes('requirements.txt')) {
      return 'python';
    }
    
    // Check for Rust project
    if (files.includes('Cargo.toml')) {
      return 'rust';
    }
    
    // Check for Go project
    if (files.includes('go.mod')) {
      return 'go';
    }
    
    return null;
  } catch (error) {
    console.error('Error detecting project type:', error);
    return null;
  }
};

/**
 * Builds a project based on its type
 */
export const buildProject = async (projectPath: string): Promise<BuildResult> => {
  try {
    const projectType = await detectProjectType(projectPath);
    
    if (!projectType) {
      return {
        success: false,
        error: 'Unable to detect project type. Supported types: Node.js, Python, Rust, Go'
      };
    }
    
    console.log(`Building ${projectType} project at ${projectPath}`);
    
    let buildCommand: string;
    let buildArgs: string[] = [];
    
    switch (projectType) {
      case 'nodejs':
        // Check if yarn.lock exists, otherwise use npm
        try {
          await fs.access(path.join(projectPath, 'yarn.lock'));
          buildCommand = 'yarn';
          buildArgs = ['install'];
        } catch {
          buildCommand = 'npm';
          buildArgs = ['install'];
        }
        break;
        
      case 'python':
        buildCommand = 'pip';
        buildArgs = ['install', '-e', '.'];
        break;
        
      case 'rust':
        buildCommand = 'cargo';
        buildArgs = ['build', '--release'];
        break;
        
      case 'go':
        buildCommand = 'go';
        buildArgs = ['build', './...'];
        break;
        
      default:
        return {
          success: false,
          error: `Unsupported project type: ${projectType}`
        };
    }
    
    // Execute build command
    const { stdout, stderr } = await execAsync(`${buildCommand} ${buildArgs.join(' ')}`, {
      cwd: projectPath,
      timeout: 300000 // 5 minute timeout
    });
    
    console.log(`Build completed for ${projectType} project`);
    if (stdout) console.log('Build stdout:', stdout);
    if (stderr) console.log('Build stderr:', stderr);
    
    return {
      success: true,
      output: stdout
    };
  } catch (error: any) {
    console.error('Error building project:', error);
    return {
      success: false,
      error: `Build failed: ${error.message}`
    };
  }
};

/**
 * Lists all cloned repositories in the PROJECTS directory
 */
export const listRepositories = async (): Promise<RepositoryInfo[]> => {
  try {
    await ensureProjectsDirectory();
    const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
    const repositories: RepositoryInfo[] = [];
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectPath = path.join(PROJECTS_DIR, entry.name);
        
        try {
          // Try to get git remote URL
          const { stdout } = await execAsync('git remote get-url origin', {
            cwd: projectPath,
            timeout: 5000
          });
          
          const stats = await fs.stat(projectPath);
          
          repositories.push({
            url: stdout.trim(),
            name: entry.name,
            projectPath,
            clonedAt: stats.birthtime.toISOString()
          });
        } catch (error) {
          // Skip directories that aren't git repositories
          console.warn(`Skipping non-git directory: ${entry.name}`);
        }
      }
    }
    
    return repositories;
  } catch (error) {
    console.error('Error listing repositories:', error);
    return [];
  }
};

/**
 * Checks if a repository is already cloned
 */
export const isRepositoryCloned = async (url: string): Promise<boolean> => {
  try {
    const repoName = extractRepoName(url);
    const projectPath = path.join(PROJECTS_DIR, repoName);
    await fs.access(projectPath);
    return true;
  } catch {
    return false;
  }
};

export default {
  validateGitHubUrl,
  extractRepoName,
  ensureProjectsDirectory,
  cloneRepository,
  removeRepository,
  detectProjectType,
  buildProject,
  listRepositories,
  isRepositoryCloned
};
