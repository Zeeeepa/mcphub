import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';

interface InstallResult {
  success: boolean;
  message?: string;
  serverConfig?: any;
  projectPath?: string;
}

interface ProjectAnalysis {
  type: 'nodejs' | 'python' | 'unknown';
  hasPackageJson: boolean;
  hasPyprojectToml: boolean;
  hasRequirementsTxt: boolean;
  mainFile?: string;
  binaries?: { [key: string]: string };
  mcpConfig?: any;
}

const PROJECTS_DIR = path.join(process.cwd(), 'PROJECTS');

// Ensure PROJECTS directory exists
function ensureProjectsDirectory(): void {
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    console.log('Created PROJECTS directory:', PROJECTS_DIR);
  }
}

// Parse GitHub URL to extract owner and repo
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    // Handle various GitHub URL formats
    const patterns = [
      /github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/,
      /github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace(/\.git$/, ''),
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error parsing GitHub URL:', error);
    return null;
  }
}

// Execute command with promise
function execCommand(command: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { 
      cwd, 
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true 
    });
    
    let stdout = '';
    let stderr = '';

    process.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
      }
    });

    process.on('error', (error) => {
      reject(error);
    });
  });
}

// Clone repository from GitHub
async function cloneRepository(url: string, projectPath: string): Promise<void> {
  try {
    console.log(`Cloning repository from ${url} to ${projectPath}`);
    await execCommand('git', ['clone', url, projectPath]);
    console.log('Repository cloned successfully');
  } catch (error) {
    console.error('Error cloning repository:', error);
    throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Analyze project structure to determine type and configuration
function analyzeProject(projectPath: string): ProjectAnalysis {
  const analysis: ProjectAnalysis = {
    type: 'unknown',
    hasPackageJson: false,
    hasPyprojectToml: false,
    hasRequirementsTxt: false,
  };

  try {
    // Check for Node.js project
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      analysis.hasPackageJson = true;
      analysis.type = 'nodejs';
      
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        analysis.mainFile = packageJson.main;
        analysis.binaries = packageJson.bin;
        
        // Look for MCP-related configuration
        if (packageJson.mcp || packageJson.keywords?.includes('mcp')) {
          analysis.mcpConfig = {
            name: packageJson.name,
            description: packageJson.description,
            main: packageJson.main,
            bin: packageJson.bin,
          };
        }
      } catch (error) {
        console.error('Error parsing package.json:', error);
      }
    }

    // Check for Python project
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    
    if (fs.existsSync(pyprojectPath)) {
      analysis.hasPyprojectToml = true;
      if (analysis.type === 'unknown') analysis.type = 'python';
    }
    
    if (fs.existsSync(requirementsPath)) {
      analysis.hasRequirementsTxt = true;
      if (analysis.type === 'unknown') analysis.type = 'python';
    }

    // Look for common MCP patterns in README
    const readmePath = path.join(projectPath, 'README.md');
    if (fs.existsSync(readmePath)) {
      try {
        const readme = fs.readFileSync(readmePath, 'utf8');
        if (readme.toLowerCase().includes('mcp') || readme.toLowerCase().includes('model context protocol')) {
          // Try to extract configuration from README
          analysis.mcpConfig = analysis.mcpConfig || extractConfigFromReadme(readme, analysis);
        }
      } catch (error) {
        console.error('Error reading README:', error);
      }
    }

    return analysis;
  } catch (error) {
    console.error('Error analyzing project:', error);
    return analysis;
  }
}

// Extract MCP configuration from README
function extractConfigFromReadme(readme: string, analysis: ProjectAnalysis): any {
  try {
    const config: any = {};
    
    // Look for common patterns in README
    if (analysis.type === 'nodejs') {
      // Look for npx commands
      const npxMatch = readme.match(/npx\s+([^\s]+)/);
      if (npxMatch) {
        config.command = 'npx';
        config.args = [npxMatch[1]];
      }
      
      // Look for node commands
      const nodeMatch = readme.match(/node\s+([^\s]+)/);
      if (nodeMatch) {
        config.command = 'node';
        config.args = [nodeMatch[1]];
      }
    } else if (analysis.type === 'python') {
      // Look for python commands
      const pythonMatch = readme.match(/python\s+([^\s]+)/);
      if (pythonMatch) {
        config.command = 'python';
        config.args = [pythonMatch[1]];
      }
      
      // Look for uvx commands
      const uvxMatch = readme.match(/uvx\s+([^\s]+)/);
      if (uvxMatch) {
        config.command = 'uvx';
        config.args = [uvxMatch[1]];
      }
    }

    return Object.keys(config).length > 0 ? config : null;
  } catch (error) {
    console.error('Error extracting config from README:', error);
    return null;
  }
}

// Build Node.js project
async function buildNodeProject(projectPath: string): Promise<void> {
  try {
    console.log('Installing Node.js dependencies...');
    await execCommand('npm', ['install'], projectPath);
    console.log('Node.js dependencies installed successfully');
    
    // Try to build if build script exists
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.scripts?.build) {
        console.log('Building project...');
        await execCommand('npm', ['run', 'build'], projectPath);
        console.log('Project built successfully');
      }
    }
  } catch (error) {
    console.error('Error building Node.js project:', error);
    throw new Error(`Failed to build Node.js project: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Build Python project
async function buildPythonProject(projectPath: string): Promise<void> {
  try {
    // Install dependencies if requirements.txt exists
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      console.log('Installing Python dependencies...');
      await execCommand('pip', ['install', '-r', 'requirements.txt'], projectPath);
      console.log('Python dependencies installed successfully');
    }
    
    // Install project if pyproject.toml exists
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      console.log('Installing Python project...');
      await execCommand('pip', ['install', '-e', '.'], projectPath);
      console.log('Python project installed successfully');
    }
  } catch (error) {
    console.error('Error building Python project:', error);
    throw new Error(`Failed to build Python project: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Generate server configuration from analysis
function generateServerConfig(analysis: ProjectAnalysis, projectPath: string, repoName: string): any {
  const config: any = {
    type: 'stdio',
    installed: true,
    installSource: 'github',
    projectPath: projectPath,
    installDate: new Date().toISOString(),
  };

  if (analysis.mcpConfig) {
    // Use extracted MCP configuration
    Object.assign(config, analysis.mcpConfig);
  } else {
    // Generate default configuration based on project type
    if (analysis.type === 'nodejs') {
      if (analysis.binaries && Object.keys(analysis.binaries).length > 0) {
        // Use first binary
        const binaryName = Object.keys(analysis.binaries)[0];
        const binaryPath = path.resolve(projectPath, analysis.binaries[binaryName]);
        config.command = 'node';
        config.args = [binaryPath];
      } else if (analysis.mainFile) {
        config.command = 'node';
        config.args = [path.resolve(projectPath, analysis.mainFile)];
      } else {
        // Default to index.js
        config.command = 'node';
        config.args = [path.join(projectPath, 'index.js')];
      }
    } else if (analysis.type === 'python') {
      // Try common Python entry points
      const possibleEntries = ['main.py', 'app.py', '__main__.py', 'server.py'];
      let entryPoint = null;
      
      for (const entry of possibleEntries) {
        if (fs.existsSync(path.join(projectPath, entry))) {
          entryPoint = entry;
          break;
        }
      }
      
      if (entryPoint) {
        config.command = 'python';
        config.args = [path.join(projectPath, entryPoint)];
      } else {
        // Default to python module execution
        config.command = 'python';
        config.args = ['-m', repoName.replace(/-/g, '_')];
      }
    }
  }

  return config;
}

// Clean up failed installation
async function cleanupFailedInstall(projectPath: string): Promise<void> {
  try {
    if (fs.existsSync(projectPath)) {
      await fs.promises.rm(projectPath, { recursive: true, force: true });
      console.log('Cleaned up failed installation:', projectPath);
    }
  } catch (error) {
    console.error('Error cleaning up failed installation:', error);
  }
}

// Main installation function
export async function installFromGitHub(url: string): Promise<InstallResult> {
  ensureProjectsDirectory();
  
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    return {
      success: false,
      message: 'Invalid GitHub URL format',
    };
  }

  const { owner, repo } = parsed;
  const projectPath = path.join(PROJECTS_DIR, `${owner}-${repo}`);

  // Check if project already exists
  if (fs.existsSync(projectPath)) {
    return {
      success: false,
      message: `Project ${owner}/${repo} is already installed`,
    };
  }

  try {
    // Step 1: Clone repository
    await cloneRepository(url, projectPath);

    // Step 2: Analyze project
    const analysis = analyzeProject(projectPath);
    console.log('Project analysis:', analysis);

    // Step 3: Build project based on type
    if (analysis.type === 'nodejs') {
      await buildNodeProject(projectPath);
    } else if (analysis.type === 'python') {
      await buildPythonProject(projectPath);
    }

    // Step 4: Generate server configuration
    const serverConfig = generateServerConfig(analysis, projectPath, repo);

    return {
      success: true,
      message: `Successfully installed ${owner}/${repo}`,
      serverConfig,
      projectPath,
    };
  } catch (error) {
    console.error('Installation failed:', error);
    
    // Clean up on failure
    await cleanupFailedInstall(projectPath);
    
    return {
      success: false,
      message: `Installation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// Uninstall function
export async function uninstallGitHubProject(projectPath: string): Promise<InstallResult> {
  try {
    if (!fs.existsSync(projectPath)) {
      return {
        success: false,
        message: 'Project directory does not exist',
      };
    }

    // Remove project directory
    await fs.promises.rm(projectPath, { recursive: true, force: true });
    
    return {
      success: true,
      message: 'Project uninstalled successfully',
    };
  } catch (error) {
    console.error('Uninstall failed:', error);
    return {
      success: false,
      message: `Uninstall failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// List installed projects
export function listInstalledProjects(): Array<{ name: string; path: string; installDate?: string }> {
  ensureProjectsDirectory();
  
  try {
    const projects: Array<{ name: string; path: string; installDate?: string }> = [];
    const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectPath = path.join(PROJECTS_DIR, entry.name);
        projects.push({
          name: entry.name,
          path: projectPath,
        });
      }
    }
    
    return projects;
  } catch (error) {
    console.error('Error listing installed projects:', error);
    return [];
  }
}
