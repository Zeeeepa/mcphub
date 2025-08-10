import { Request, Response } from 'express';
import { ApiResponse } from '../types/index.js';
import {
  installFromGitHub,
  parseGitHubUrl,
  checkGitAvailable,
  checkNodeAvailable,
  checkPythonAvailable,
} from '../services/installationService.js';

export const installFromGitHubRepo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { githubUrl, serverName } = req.body;

    if (!githubUrl || typeof githubUrl !== 'string') {
      res.status(400).json({
        success: false,
        message: 'GitHub URL is required',
      });
      return;
    }

    // Validate GitHub URL format
    const repoInfo = parseGitHubUrl(githubUrl);
    if (!repoInfo) {
      res.status(400).json({
        success: false,
        message: 'Invalid GitHub URL format. Please provide a valid GitHub repository URL.',
      });
      return;
    }

    // Get current user for owner field
    const currentUser = (req as any).user;
    const owner = currentUser?.username || 'admin';

    // Perform installation
    const result = await installFromGitHub(githubUrl, serverName, owner);

    if (result.success) {
      const response: ApiResponse = {
        success: true,
        data: {
          serverName: result.serverName,
          message: result.message,
        },
        message: result.message,
      };
      res.json(response);
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Failed to install from GitHub:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during installation',
    });
  }
};

export const checkInstallationPrerequisites = async (_: Request, res: Response): Promise<void> => {
  try {
    const [gitAvailable, nodeAvailable, pythonAvailable] = await Promise.all([
      checkGitAvailable(),
      checkNodeAvailable(),
      checkPythonAvailable(),
    ]);

    const response: ApiResponse = {
      success: true,
      data: {
        git: gitAvailable,
        node: nodeAvailable,
        python: pythonAvailable,
        canInstallNode: gitAvailable && nodeAvailable,
        canInstallPython: gitAvailable && pythonAvailable,
        canInstall: gitAvailable && (nodeAvailable || pythonAvailable),
      },
    };

    res.json(response);
  } catch (error) {
    console.error('Failed to check prerequisites:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check installation prerequisites',
    });
  }
};

export const validateGitHubUrl = (req: Request, res: Response): void => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      res.status(400).json({
        success: false,
        message: 'URL is required',
      });
      return;
    }

    const repoInfo = parseGitHubUrl(url);
    
    if (repoInfo) {
      const response: ApiResponse = {
        success: true,
        data: {
          valid: true,
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          url: repoInfo.url,
        },
      };
      res.json(response);
    } else {
      res.json({
        success: true,
        data: {
          valid: false,
          message: 'Invalid GitHub URL format',
        },
      });
    }
  } catch (error) {
    console.error('Failed to validate GitHub URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate URL',
    });
  }
};
