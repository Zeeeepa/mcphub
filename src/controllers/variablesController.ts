import { Request, Response } from 'express';
import { ApiResponse } from '../types/index.js';
import {
  getAllVariables,
  getVariable,
  setVariable,
  deleteVariable,
  isValidVariableKey,
  SavedVariable,
} from '../services/variablesService.js';

export const getVariables = (_: Request, res: Response): void => {
  try {
    const variables = getAllVariables();
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

    const variable = getVariable(key);
    
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
    const { key, value, description } = req.body;

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

    const variable = setVariable(key, value, description);

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
