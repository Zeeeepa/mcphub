import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { loadSettings, saveSettings } from '../config/index.js';

export interface SavedVariable {
  key: string;
  value: string;
  description?: string;
  encrypted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VariablesStorage {
  variables: { [key: string]: SavedVariable };
}

const VARIABLES_FILE = 'saved_variables.json';
const ENCRYPTION_KEY_FILE = '.variables_key';

// Generate or load encryption key
const getEncryptionKey = (): string => {
  const keyPath = path.join(process.cwd(), ENCRYPTION_KEY_FILE);
  
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8').trim();
  }
  
  // Generate new key
  const key = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyPath, key, { mode: 0o600 }); // Restrict file permissions
  return key;
};

// Encrypt a value
const encryptValue = (value: string): string => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher('aes-256-cbc', key);
  
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
};

// Decrypt a value
const decryptValue = (encryptedValue: string): string => {
  try {
    const key = getEncryptionKey();
    const [ivHex, encrypted] = encryptedValue.split(':');
    
    if (!ivHex || !encrypted) {
      throw new Error('Invalid encrypted format');
    }
    
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return encryptedValue; // Return as-is if decryption fails
  }
};

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
export const setVariable = (key: string, value: string, description?: string, encrypt?: boolean): SavedVariable => {
  const storage = loadVariables();
  const now = new Date().toISOString();
  
  // Determine if value should be encrypted (for sensitive data like API keys)
  const shouldEncrypt = encrypt !== undefined ? encrypt : 
    (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret') || 
     key.toLowerCase().includes('token') || key.toLowerCase().includes('password'));
  
  const existingVariable = storage.variables[key];
  const variable: SavedVariable = {
    key,
    value: shouldEncrypt ? encryptValue(value) : value,
    description,
    encrypted: shouldEncrypt,
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

// Get decrypted variable value for substitution
const getVariableValue = (variable: SavedVariable): string => {
  if (variable.encrypted) {
    return decryptValue(variable.value);
  }
  return variable.value;
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
        return variable ? getVariableValue(variable) : match;
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

// Export variables to JSON format
export const exportVariables = (): { variables: SavedVariable[], exportedAt: string } => {
  const storage = loadVariables();
  const variables = Object.values(storage.variables).map(variable => ({
    ...variable,
    // For export, decrypt encrypted values for portability
    value: variable.encrypted ? decryptValue(variable.value) : variable.value,
    encrypted: false, // Reset encryption flag for export
  }));
  
  return {
    variables,
    exportedAt: new Date().toISOString(),
  };
};

// Import variables from JSON format
export const importVariables = (importData: { variables: SavedVariable[] }, overwrite: boolean = false): { imported: number, skipped: number, errors: string[] } => {
  const storage = loadVariables();
  const results = { imported: 0, skipped: 0, errors: [] as string[] };
  
  for (const variable of importData.variables) {
    try {
      // Validate variable format
      if (!variable.key || !variable.value) {
        results.errors.push(`Invalid variable format: missing key or value`);
        continue;
      }
      
      // Check if variable already exists
      if (storage.variables[variable.key] && !overwrite) {
        results.skipped++;
        continue;
      }
      
      // Import the variable (will auto-encrypt if needed)
      setVariable(variable.key, variable.value, variable.description);
      results.imported++;
    } catch (error) {
      results.errors.push(`Failed to import variable ${variable.key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  return results;
};

// Get variable for display (with masked encrypted values)
export const getVariableForDisplay = (key: string): SavedVariable | null => {
  const variable = getVariable(key);
  if (!variable) return null;
  
  return {
    ...variable,
    value: variable.encrypted ? '••••••••' : variable.value,
  };
};

// Get all variables for display (with masked encrypted values)
export const getAllVariablesForDisplay = (): SavedVariable[] => {
  const variables = getAllVariables();
  return variables.map(variable => ({
    ...variable,
    value: variable.encrypted ? '••••••••' : variable.value,
  }));
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
