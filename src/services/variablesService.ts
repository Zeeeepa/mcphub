import fs from 'fs';
import path from 'path';
import { loadSettings, saveSettings } from '../config/index.js';

export interface SavedVariable {
  key: string;
  value: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VariablesStorage {
  variables: { [key: string]: SavedVariable };
}

const VARIABLES_FILE = 'saved_variables.json';

// Get the variables file path
const getVariablesFilePath = (): string => {
  return path.join(process.cwd(), VARIABLES_FILE);
};

// Load variables from file
export const loadVariables = (): VariablesStorage => {
  try {
    const filePath = getVariablesFilePath();
    if (!fs.existsSync(filePath)) {
      return { variables: {} };
    }
    
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading variables:', error);
    return { variables: {} };
  }
};

// Save variables to file
export const saveVariables = (storage: VariablesStorage): void => {
  try {
    const filePath = getVariablesFilePath();
    fs.writeFileSync(filePath, JSON.stringify(storage, null, 2));
  } catch (error) {
    console.error('Error saving variables:', error);
    throw new Error('Failed to save variables');
  }
};

// Get all variables
export const getAllVariables = (): SavedVariable[] => {
  const storage = loadVariables();
  return Object.values(storage.variables);
};

// Get variable by key
export const getVariable = (key: string): SavedVariable | null => {
  const storage = loadVariables();
  return storage.variables[key] || null;
};

// Add or update variable
export const setVariable = (key: string, value: string, description?: string): SavedVariable => {
  const storage = loadVariables();
  const now = new Date().toISOString();
  
  const existingVariable = storage.variables[key];
  const variable: SavedVariable = {
    key,
    value,
    description,
    createdAt: existingVariable?.createdAt || now,
    updatedAt: now,
  };
  
  storage.variables[key] = variable;
  saveVariables(storage);
  
  return variable;
};

// Delete variable
export const deleteVariable = (key: string): boolean => {
  const storage = loadVariables();
  
  if (!storage.variables[key]) {
    return false;
  }
  
  delete storage.variables[key];
  saveVariables(storage);
  
  return true;
};

// Substitute variables in a configuration object
export const substituteVariables = (config: any): any => {
  const storage = loadVariables();
  const variables = storage.variables;
  
  const substitute = (obj: any): any => {
    if (typeof obj === 'string') {
      // Replace variables in format ${VAR_NAME} or $VAR_NAME
      return obj.replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g, (match, varName) => {
        const variable = variables[varName];
        return variable ? variable.value : match;
      });
    } else if (Array.isArray(obj)) {
      return obj.map(substitute);
    } else if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = substitute(value);
      }
      return result;
    }
    return obj;
  };
  
  return substitute(config);
};

// Check if a string contains variables
export const containsVariables = (text: string): boolean => {
  return /\$\{?[A-Z_][A-Z0-9_]*\}?/.test(text);
};

// Extract variable names from text
export const extractVariableNames = (text: string): string[] => {
  const matches = text.match(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g);
  if (!matches) return [];
  
  return matches.map(match => {
    const varName = match.replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/, '$1');
    return varName;
  });
};

// Validate variable key format
export const isValidVariableKey = (key: string): boolean => {
  return /^[A-Z_][A-Z0-9_]*$/.test(key);
};
