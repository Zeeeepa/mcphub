import { Request, Response } from 'express';
import { getSavedVariables, setSavedVariables } from '../config/index.js';
import { ApiResponse } from '../types/index.js';

// Get saved variables for the current user
export const getUserVariables = (req: Request, res: Response): void => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      } as ApiResponse);
      return;
    }

    const variables = getSavedVariables(user.username);
    
    res.json({
      success: true,
      data: variables,
    } as ApiResponse<Record<string, string>>);
  } catch (error) {
    console.error('Error getting user variables:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get variables',
    } as ApiResponse);
  }
};

// Save variables for the current user
export const saveUserVariables = (req: Request, res: Response): void => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      } as ApiResponse);
      return;
    }

    const { variables } = req.body;
    
    if (!variables || typeof variables !== 'object') {
      res.status(400).json({
        success: false,
        message: 'Variables must be an object',
      } as ApiResponse);
      return;
    }

    const success = setSavedVariables(user.username, variables);
    
    if (success) {
      res.json({
        success: true,
        message: 'Variables saved successfully',
      } as ApiResponse);
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to save variables',
      } as ApiResponse);
    }
  } catch (error) {
    console.error('Error saving user variables:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save variables',
    } as ApiResponse);
  }
};

// Add or update a single variable for the current user
export const saveUserVariable = (req: Request, res: Response): void => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      } as ApiResponse);
      return;
    }

    const { key, value } = req.body;
    
    if (!key || typeof key !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Key is required and must be a string',
      } as ApiResponse);
      return;
    }

    if (value === undefined || value === null) {
      res.status(400).json({
        success: false,
        message: 'Value is required',
      } as ApiResponse);
      return;
    }

    // Get existing variables
    const existingVariables = getSavedVariables(user.username);
    
    // Add or update the variable
    existingVariables[key] = String(value);
    
    const success = setSavedVariables(user.username, existingVariables);
    
    if (success) {
      res.json({
        success: true,
        message: 'Variable saved successfully',
      } as ApiResponse);
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to save variable',
      } as ApiResponse);
    }
  } catch (error) {
    console.error('Error saving user variable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save variable',
    } as ApiResponse);
  }
};

// Delete a variable for the current user
export const deleteUserVariable = (req: Request, res: Response): void => {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      } as ApiResponse);
      return;
    }

    const { key } = req.params;
    
    if (!key) {
      res.status(400).json({
        success: false,
        message: 'Key is required',
      } as ApiResponse);
      return;
    }

    // Get existing variables
    const existingVariables = getSavedVariables(user.username);
    
    // Check if variable exists
    if (!(key in existingVariables)) {
      res.status(404).json({
        success: false,
        message: 'Variable not found',
      } as ApiResponse);
      return;
    }
    
    // Delete the variable
    delete existingVariables[key];
    
    const success = setSavedVariables(user.username, existingVariables);
    
    if (success) {
      res.json({
        success: true,
        message: 'Variable deleted successfully',
      } as ApiResponse);
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to delete variable',
      } as ApiResponse);
    }
  } catch (error) {
    console.error('Error deleting user variable:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete variable',
    } as ApiResponse);
  }
};
