import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getSettingsPath, clearSettingsCache } from '../config/index.js';
import { notifyToolChanged } from '../services/mcpService.js';

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/app/PROJECTS';

// Get raw mcp_settings.json content
export const getRawSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const settingsPath = getSettingsPath();
    const rawContent = await fs.readFile(settingsPath, 'utf-8');
    
    res.json({
      success: true,
      data: {
        content: rawContent,
        path: settingsPath,
      },
    });
  } catch (error) {
    console.error('Failed to read raw settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to read settings file',
    });
  }
};

// Update raw mcp_settings.json content
export const updateRawSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { content } = req.body;
    
    if (typeof content !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Content must be a string',
      });
      return;
    }

    // Validate JSON
    let parsedSettings;
    try {
      parsedSettings = JSON.parse(content);
    } catch (parseError) {
      res.status(400).json({
        success: false,
        message: 'Invalid JSON format',
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return;
    }

    // Basic validation - ensure required structure
    if (!parsedSettings || typeof parsedSettings !== 'object') {
      res.status(400).json({
        success: false,
        message: 'Settings must be a valid JSON object',
      });
      return;
    }

    if (!parsedSettings.mcpServers || typeof parsedSettings.mcpServers !== 'object') {
      res.status(400).json({
        success: false,
        message: 'Settings must contain mcpServers object',
      });
      return;
    }

    // Write to file
    const settingsPath = getSettingsPath();
    await fs.writeFile(settingsPath, content, 'utf-8');
    
    // Clear cache and trigger reload
    clearSettingsCache();
    await notifyToolChanged();

    res.json({
      success: true,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    console.error('Failed to update raw settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings file',
    });
  }
};

// Reload settings and notify servers
export const reloadSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    clearSettingsCache();
    await notifyToolChanged();
    
    res.json({
      success: true,
      message: 'Settings reloaded successfully',
    });
  } catch (error) {
    console.error('Failed to reload settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reload settings',
    });
  }
};

// Get list of projects in WORKSPACE_DIR
export const getProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    // Ensure workspace directory exists
    await fs.mkdir(WORKSPACE_DIR, { recursive: true });
    
    const entries = await fs.readdir(WORKSPACE_DIR, { withFileTypes: true });
    const projects = entries
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        name: entry.name,
        path: path.join(WORKSPACE_DIR, entry.name),
      }));

    res.json({
      success: true,
      data: projects,
    });
  } catch (error) {
    console.error('Failed to get projects:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get projects list',
    });
  }
};

// Get project-specific settings
export const getProjectSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectName } = req.params;
    
    if (!projectName) {
      res.status(400).json({
        success: false,
        message: 'Project name is required',
      });
      return;
    }

    const projectPath = path.join(WORKSPACE_DIR, projectName);
    const settingsPath = path.join(projectPath, 'mcp_project_settings.json');

    try {
      // Check if project directory exists
      await fs.access(projectPath);
      
      // Try to read project settings
      const content = await fs.readFile(settingsPath, 'utf-8');
      
      res.json({
        success: true,
        data: {
          content,
          path: settingsPath,
          projectName,
        },
      });
    } catch (readError) {
      // If settings file doesn't exist, return empty settings
      const defaultSettings = {
        name: projectName,
        description: '',
        version: '1.0.0',
        settings: {},
      };
      
      res.json({
        success: true,
        data: {
          content: JSON.stringify(defaultSettings, null, 2),
          path: settingsPath,
          projectName,
          isDefault: true,
        },
      });
    }
  } catch (error) {
    console.error('Failed to get project settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get project settings',
    });
  }
};

// Update project-specific settings
export const updateProjectSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectName } = req.params;
    const { content } = req.body;
    
    if (!projectName) {
      res.status(400).json({
        success: false,
        message: 'Project name is required',
      });
      return;
    }

    if (typeof content !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Content must be a string',
      });
      return;
    }

    // Validate JSON
    try {
      JSON.parse(content);
    } catch (parseError) {
      res.status(400).json({
        success: false,
        message: 'Invalid JSON format',
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return;
    }

    const projectPath = path.join(WORKSPACE_DIR, projectName);
    const settingsPath = path.join(projectPath, 'mcp_project_settings.json');

    // Ensure project directory exists
    await fs.mkdir(projectPath, { recursive: true });
    
    // Write settings file
    await fs.writeFile(settingsPath, content, 'utf-8');

    res.json({
      success: true,
      message: 'Project settings updated successfully',
    });
  } catch (error) {
    console.error('Failed to update project settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update project settings',
    });
  }
};

// Get global secrets (.env)
export const getGlobalSecrets = async (req: Request, res: Response): Promise<void> => {
  try {
    const envPath = path.join(process.cwd(), '.env');
    
    try {
      const content = await fs.readFile(envPath, 'utf-8');
      
      // Parse .env content into key-value pairs
      const secrets: Record<string, string> = {};
      const lines = content.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const equalIndex = trimmed.indexOf('=');
          if (equalIndex > 0) {
            const key = trimmed.substring(0, equalIndex).trim();
            const value = trimmed.substring(equalIndex + 1).trim();
            // Remove quotes if present
            secrets[key] = value.replace(/^["']|["']$/g, '');
          }
        }
      }

      res.json({
        success: true,
        data: {
          secrets,
          rawContent: content,
          path: envPath,
        },
      });
    } catch (readError) {
      // If .env doesn't exist, return empty
      res.json({
        success: true,
        data: {
          secrets: {},
          rawContent: '',
          path: envPath,
          isDefault: true,
        },
      });
    }
  } catch (error) {
    console.error('Failed to get global secrets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get global secrets',
    });
  }
};

// Update global secrets (.env)
export const updateGlobalSecrets = async (req: Request, res: Response): Promise<void> => {
  try {
    const { secrets, rawContent } = req.body;
    
    const envPath = path.join(process.cwd(), '.env');
    let content = '';

    if (rawContent && typeof rawContent === 'string') {
      // Use raw content if provided
      content = rawContent;
    } else if (secrets && typeof secrets === 'object') {
      // Generate .env content from secrets object
      content = Object.entries(secrets)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    } else {
      res.status(400).json({
        success: false,
        message: 'Either secrets object or rawContent string is required',
      });
      return;
    }

    await fs.writeFile(envPath, content, 'utf-8');

    res.json({
      success: true,
      message: 'Global secrets updated successfully',
    });
  } catch (error) {
    console.error('Failed to update global secrets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update global secrets',
    });
  }
};

// Get project-specific secrets (.env)
export const getProjectSecrets = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectName } = req.params;
    
    if (!projectName) {
      res.status(400).json({
        success: false,
        message: 'Project name is required',
      });
      return;
    }

    const projectPath = path.join(WORKSPACE_DIR, projectName);
    const envPath = path.join(projectPath, '.env');

    try {
      // Check if project directory exists
      await fs.access(projectPath);
      
      const content = await fs.readFile(envPath, 'utf-8');
      
      // Parse .env content into key-value pairs
      const secrets: Record<string, string> = {};
      const lines = content.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const equalIndex = trimmed.indexOf('=');
          if (equalIndex > 0) {
            const key = trimmed.substring(0, equalIndex).trim();
            const value = trimmed.substring(equalIndex + 1).trim();
            // Remove quotes if present
            secrets[key] = value.replace(/^["']|["']$/g, '');
          }
        }
      }

      res.json({
        success: true,
        data: {
          secrets,
          rawContent: content,
          path: envPath,
          projectName,
        },
      });
    } catch (readError) {
      // If .env doesn't exist, return empty
      res.json({
        success: true,
        data: {
          secrets: {},
          rawContent: '',
          path: envPath,
          projectName,
          isDefault: true,
        },
      });
    }
  } catch (error) {
    console.error('Failed to get project secrets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get project secrets',
    });
  }
};

// Update project-specific secrets (.env)
export const updateProjectSecrets = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectName } = req.params;
    const { secrets, rawContent } = req.body;
    
    if (!projectName) {
      res.status(400).json({
        success: false,
        message: 'Project name is required',
      });
      return;
    }

    const projectPath = path.join(WORKSPACE_DIR, projectName);
    const envPath = path.join(projectPath, '.env');
    let content = '';

    if (rawContent && typeof rawContent === 'string') {
      // Use raw content if provided
      content = rawContent;
    } else if (secrets && typeof secrets === 'object') {
      // Generate .env content from secrets object
      content = Object.entries(secrets)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    } else {
      res.status(400).json({
        success: false,
        message: 'Either secrets object or rawContent string is required',
      });
      return;
    }

    // Ensure project directory exists
    await fs.mkdir(projectPath, { recursive: true });
    
    await fs.writeFile(envPath, content, 'utf-8');

    res.json({
      success: true,
      message: 'Project secrets updated successfully',
    });
  } catch (error) {
    console.error('Failed to update project secrets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update project secrets',
    });
  }
};
