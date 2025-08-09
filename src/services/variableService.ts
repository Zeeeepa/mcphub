import * as fs from 'fs';
import * as path from 'path';
import { createSafeJSON } from '../utils/serialization.js';

interface VariableResult {
  success: boolean;
  message?: string;
}

interface Variables {
  [key: string]: string;
}

const VARIABLES_FILE = path.join(process.cwd(), 'variables.json');

// Load variables from file
function loadVariables(): Variables {
  try {
    if (fs.existsSync(VARIABLES_FILE)) {
      const data = fs.readFileSync(VARIABLES_FILE, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    console.error('Error loading variables:', error);
    return {};
  }
}

// Save variables to file
function saveVariables(variables: Variables): void {
  try {
    fs.writeFileSync(VARIABLES_FILE, JSON.stringify(variables, null, 2));
  } catch (error) {
    console.error('Error saving variables:', error);
    throw new Error('Failed to save variables');
  }
}

export function getAllVariables(): Variables {
  return loadVariables();
}

export function createVariable(key: string, value: string): VariableResult {
  try {
    const variables = loadVariables();
    
    // Check if variable already exists
    if (variables[key]) {
      return {
        success: false,
        message: `Variable '${key}' already exists. Use update to modify it.`,
      };
    }

    variables[key] = value;
    saveVariables(variables);

    return { success: true };
  } catch (error) {
    console.error('Error creating variable:', error);
    return {
      success: false,
      message: 'Failed to create variable',
    };
  }
}

export function updateVariable(key: string, value: string): VariableResult {
  try {
    const variables = loadVariables();
    
    // Check if variable exists
    if (!variables[key]) {
      return {
        success: false,
        message: `Variable '${key}' does not exist`,
      };
    }

    variables[key] = value;
    saveVariables(variables);

    return { success: true };
  } catch (error) {
    console.error('Error updating variable:', error);
    return {
      success: false,
      message: 'Failed to update variable',
    };
  }
}

export function deleteVariable(key: string): VariableResult {
  try {
    const variables = loadVariables();
    
    // Check if variable exists
    if (!variables[key]) {
      return {
        success: false,
        message: `Variable '${key}' does not exist`,
      };
    }

    delete variables[key];
    saveVariables(variables);

    return { success: true };
  } catch (error) {
    console.error('Error deleting variable:', error);
    return {
      success: false,
      message: 'Failed to delete variable',
    };
  }
}

export function getVariable(key: string): string | undefined {
  const variables = loadVariables();
  return variables[key];
}

// Substitute variables in server configuration
export function substituteVariables(serverConfig: any): any {
  const variables = loadVariables();
  const configCopy = JSON.parse(JSON.stringify(serverConfig));

  // Substitute environment variables
  if (configCopy.env && typeof configCopy.env === 'object') {
    Object.keys(configCopy.env).forEach(envKey => {
      const envValue = configCopy.env[envKey];
      if (typeof envValue === 'string' && variables[envKey]) {
        configCopy.env[envKey] = variables[envKey];
        console.log(`Substituted variable ${envKey} in server configuration`);
      }
    });
  }

  // Also check for environment variables in args (for some MCP servers)
  if (configCopy.args && Array.isArray(configCopy.args)) {
    configCopy.args = configCopy.args.map((arg: string) => {
      if (typeof arg === 'string') {
        // Look for patterns like --api-key=GEMINI_API_KEY or --token=${TOKEN}
        return arg.replace(/([A-Z_]+)/g, (match) => {
          if (variables[match]) {
            console.log(`Substituted variable ${match} in server args`);
            return variables[match];
          }
          return match;
        });
      }
      return arg;
    });
  }

  return configCopy;
}

// Get variables that match environment keys in a server config
export function getMatchingVariables(serverConfig: any): { [key: string]: string } {
  const variables = loadVariables();
  const matches: { [key: string]: string } = {};

  if (serverConfig.env && typeof serverConfig.env === 'object') {
    Object.keys(serverConfig.env).forEach(envKey => {
      if (variables[envKey]) {
        matches[envKey] = variables[envKey];
      }
    });
  }

  return matches;
}
