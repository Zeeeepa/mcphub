import { Request, Response } from 'express';
import { ApiResponse } from '../types/index.js';
import {
  getAllVariablesForDisplay,
  getVariableForDisplay,
  setVariable,
  deleteVariable,
  isValidVariableKey,
  exportVariables,
  importVariables,
} from '../services/variablesService.js';

export const getVariables = (_: Request, res: Response): void => {
  try {
    const variables = getAllVariablesForDisplay(); // Use display version to mask encrypted values
    const response: ApiResponse = {
      success: true,
      data: variables,
    };
    res.json(response);
  } catch (error) {
    console.error('Failed to get variables:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get variables',
    });
  }
};

export const getVariableByKey = (req: Request, res: Response): void => {
  try {
    const { key } = req.params;
    
    if (!key) {
      res.status(400).json({
        success: false,
        message: 'Variable key is required',
      });
      return;
    }

    const variable = getVariableForDisplay(key); // Use display version to mask encrypted values
    
    if (!variable) {
      res.status(404).json({
        success: false,
        message: 'Variable not found',
      });
      return;
    }

    const response: ApiResponse = {
      success: true,
      data: variable,
    };
    res.json(response);
  } catch (error) {
    console.error('Failed to get variable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get variable',
    });
  }
};

export const createOrUpdateVariable = (req: Request, res: Response): void => {
  try {
    const { key, value, description, encrypt } = req.body;

    if (!key || typeof key !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Variable key is required and must be a string',
      });
      return;
    }

    if (!value || typeof value !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Variable value is required and must be a string',
      });
      return;
    }

    if (!isValidVariableKey(key)) {
      res.status(400).json({
        success: false,
        message: 'Variable key must contain only uppercase letters, numbers, and underscores, and start with a letter or underscore',
      });
      return;
    }

    const variable = setVariable(key, value, description, encrypt);

    const response: ApiResponse = {
      success: true,
      data: variable,
      message: 'Variable saved successfully',
    };
    res.json(response);
  } catch (error) {
    console.error('Failed to create/update variable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save variable',
    });
  }
};

export const removeVariable = (req: Request, res: Response): void => {
  try {
    const { key } = req.params;

    if (!key) {
      res.status(400).json({
        success: false,
        message: 'Variable key is required',
      });
      return;
    }

    const deleted = deleteVariable(key);

    if (!deleted) {
      res.status(404).json({
        success: false,
        message: 'Variable not found',
      });
      return;
    }

    const response: ApiResponse = {
      success: true,
      message: 'Variable deleted successfully',
    };
    res.json(response);
  } catch (error) {
    console.error('Failed to delete variable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete variable',
    });
  }
};

export const exportVariablesController = (_: Request, res: Response): void => {
  try {
    const exportData = exportVariables();
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="mcphub-variables-${new Date().toISOString().split('T')[0]}.json"`);
    
    const response: ApiResponse = {
      success: true,
      data: exportData,
    };
    res.json(response);
  } catch (error) {
    console.error('Failed to export variables:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export variables',
    });
  }
};

export const importVariablesController = (req: Request, res: Response): void => {
  try {
    const { variables, overwrite = false } = req.body;
    
    if (!variables || !Array.isArray(variables)) {
      res.status(400).json({
        success: false,
        message: 'Variables array is required',
      });
      return;
    }
    
    const results = importVariables({ variables }, overwrite);
    
    const response: ApiResponse = {
      success: true,
      data: results,
      message: `Import completed: ${results.imported} imported, ${results.skipped} skipped${results.errors.length > 0 ? `, ${results.errors.length} errors` : ''}`,
    };
    res.json(response);
  } catch (error) {
    console.error('Failed to import variables:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to import variables',
    });
  }
};
