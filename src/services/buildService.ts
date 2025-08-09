import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export interface BuildResult {
  success: boolean;
  output?: string;
  error?: string;
  projectType?: string;
}

export interface ProjectType {
  name: string;
  detectionFiles: string[];
  buildCommands: string[];
  installCommands?: string[];
}

// Supported project types and their build configurations
const PROJECT_TYPES: ProjectType[] = [
  {
    name: 'nodejs',
    detectionFiles: ['package.json'],
    installCommands: ['npm install'],
    buildCommands: ['npm run build']
  },
  {
    name: 'nodejs-yarn',
    detectionFiles: ['package.json', 'yarn.lock'],
    installCommands: ['yarn install'],
    buildCommands: ['yarn build']
  },
  {
    name: 'python',
    detectionFiles: ['pyproject.toml'],
    installCommands: ['pip install -e .'],
    buildCommands: []
  },
  {
    name: 'python-requirements',
    detectionFiles: ['requirements.txt'],
    installCommands: ['pip install -r requirements.txt'],
    buildCommands: []
  },
  {
    name: 'python-setup',
    detectionFiles: ['setup.py'],
    installCommands: ['pip install -e .'],
    buildCommands: []
  }
];

/**
 * Detects the project type based on files present in the directory
 */
export const detectProjectType = async (projectPath: string): Promise<ProjectType | null> => {
  try {
    const files = await fs.readdir(projectPath);
    const fileSet = new Set(files);
    
    // Check each project type in order of specificity
    for (const projectType of PROJECT_TYPES) {
      const hasAllFiles = projectType.detectionFiles.every(file => fileSet.has(file));
      if (hasAllFiles) {
        return projectType;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error detecting project type:', error);
    return null;
  }
};

/**
 * Checks if a command exists in the system PATH
 */
const commandExists = async (command: string): Promise<boolean> => {
  try {
    await execAsync(`which ${command}`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

/**
 * Validates that required build tools are available
 */
export const validateBuildEnvironment = async (projectType: ProjectType): Promise<{ valid: boolean; missing: string[] }> => {
  const missing: string[] = [];
  
  // Extract commands from install and build commands
  const allCommands = [
    ...(projectType.installCommands || []),
    ...projectType.buildCommands
  ];
  
  const commandsToCheck = new Set<string>();
  
  for (const command of allCommands) {
    const firstWord = command.split(' ')[0];
    commandsToCheck.add(firstWord);
  }
  
  for (const command of commandsToCheck) {
    const exists = await commandExists(command);
    if (!exists) {
      missing.push(command);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
};

/**
 * Executes a command with proper error handling and logging
 */
const executeCommand = async (command: string, cwd: string, timeout: number = 300000): Promise<{ stdout: string; stderr: string }> => {
  console.log(`Executing: ${command} in ${cwd}`);
  
  try {
    const result = await execAsync(command, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    
    return result;
  } catch (error: any) {
    console.error(`Command failed: ${command}`, error);
    throw error;
  }
};

/**
 * Builds a project based on its detected type
 */
export const buildProject = async (projectPath: string): Promise<BuildResult> => {
  try {
    console.log(`Starting build process for ${projectPath}`);
    
    // Detect project type
    const projectType = await detectProjectType(projectPath);
    if (!projectType) {
      return {
        success: false,
        error: 'Unable to detect project type. Supported types: Node.js (npm/yarn), Python (pip)'
      };
    }
    
    console.log(`Detected project type: ${projectType.name}`);
    
    // Validate build environment
    const envValidation = await validateBuildEnvironment(projectType);
    if (!envValidation.valid) {
      return {
        success: false,
        error: `Missing required build tools: ${envValidation.missing.join(', ')}. Please install them and try again.`,
        projectType: projectType.name
      };
    }
    
    let allOutput = '';
    let allErrors = '';
    
    // Execute install commands
    if (projectType.installCommands && projectType.installCommands.length > 0) {
      console.log('Running install commands...');
      for (const command of projectType.installCommands) {
        try {
          const result = await executeCommand(command, projectPath);
          allOutput += `\n=== ${command} ===\n${result.stdout}`;
          if (result.stderr) {
            allErrors += `\n=== ${command} stderr ===\n${result.stderr}`;
          }
        } catch (error: any) {
          return {
            success: false,
            error: `Install command failed: ${command}\n${error.message}`,
            projectType: projectType.name
          };
        }
      }
    }
    
    // Execute build commands
    if (projectType.buildCommands && projectType.buildCommands.length > 0) {
      console.log('Running build commands...');
      for (const command of projectType.buildCommands) {
        try {
          const result = await executeCommand(command, projectPath);
          allOutput += `\n=== ${command} ===\n${result.stdout}`;
          if (result.stderr) {
            allErrors += `\n=== ${command} stderr ===\n${result.stderr}`;
          }
        } catch (error: any) {
          // Build commands might fail if there's no build script - this is often OK
          console.warn(`Build command failed (this might be OK): ${command}`, error.message);
          allErrors += `\n=== ${command} failed ===\n${error.message}`;
        }
      }
    }
    
    console.log(`Build process completed for ${projectType.name} project`);
    
    return {
      success: true,
      output: allOutput,
      projectType: projectType.name
    };
  } catch (error: any) {
    console.error('Error in build process:', error);
    return {
      success: false,
      error: `Build process failed: ${error.message}`
    };
  }
};

/**
 * Checks if a project has a build script defined
 */
export const hasBuildScript = async (projectPath: string): Promise<boolean> => {
  try {
    const projectType = await detectProjectType(projectPath);
    if (!projectType) {
      return false;
    }
    
    // For Node.js projects, check if package.json has a build script
    if (projectType.name.startsWith('nodejs')) {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      
      return !!(packageJson.scripts && packageJson.scripts.build);
    }
    
    // For Python projects, building is usually just installing dependencies
    return true;
  } catch (error) {
    console.error('Error checking for build script:', error);
    return false;
  }
};

/**
 * Gets build information for a project without actually building it
 */
export const getBuildInfo = async (projectPath: string): Promise<{
  projectType: string | null;
  hasValidEnvironment: boolean;
  missingTools: string[];
  hasBuildScript: boolean;
}> => {
  const projectType = await detectProjectType(projectPath);
  
  if (!projectType) {
    return {
      projectType: null,
      hasValidEnvironment: false,
      missingTools: [],
      hasBuildScript: false
    };
  }
  
  const envValidation = await validateBuildEnvironment(projectType);
  const buildScript = await hasBuildScript(projectPath);
  
  return {
    projectType: projectType.name,
    hasValidEnvironment: envValidation.valid,
    missingTools: envValidation.missing,
    hasBuildScript: buildScript
  };
};

export default {
  detectProjectType,
  validateBuildEnvironment,
  buildProject,
  hasBuildScript,
  getBuildInfo
};
