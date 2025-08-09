import { Request, Response } from 'express';
import { ApiResponse } from '../types/index.js';
import {
  getAllVariables,
  createVariable,
  updateVariable,
  deleteVariable,
} from '../services/variableService.js';

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

export const addVariable = (req: Request, res: Response): void => {
  try {
    const { key, value } = req.body;
    
    if (!key || typeof key !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Variable key is required and must be a string',
      });
      return;
    }

    if (value === undefined || value === null) {
      res.status(400).json({
        success: false,
        message: 'Variable value is required',
      });
      return;
    }

    const result = createVariable(key, value);
    if (result.success) {
      res.json({
        success: true,
        message: 'Variable created successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message || 'Failed to create variable',
      });
    }
  } catch (error) {
    console.error('Failed to create variable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create variable',
    });
  }
};

export const modifyVariable = (req: Request, res: Response): void => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!key) {
      res.status(400).json({
        success: false,
        message: 'Variable key is required',
      });
      return;
    }

    if (value === undefined || value === null) {
      res.status(400).json({
        success: false,
        message: 'Variable value is required',
      });
      return;
    }

    const result = updateVariable(key, value);
    if (result.success) {
      res.json({
        success: true,
        message: 'Variable updated successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message || 'Failed to update variable',
      });
    }
  } catch (error) {
    console.error('Failed to update variable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update variable',
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

    const result = deleteVariable(key);
    if (result.success) {
      res.json({
        success: true,
        message: 'Variable deleted successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message || 'Failed to delete variable',
      });
    }
  } catch (error) {
    console.error('Failed to delete variable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete variable',
    });
  }
};
