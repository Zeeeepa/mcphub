import { ApiResponse, SavedVariable } from '../types';

const API_BASE = '/api';

// Get all saved variables for the current user
export const getUserVariables = async (): Promise<ApiResponse<Record<string, string>>> => {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}/variables`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  return response.json();
};

// Save all variables for the current user (replaces existing)
export const saveUserVariables = async (variables: Record<string, string>): Promise<ApiResponse> => {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}/variables`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ variables }),
  });

  return response.json();
};

// Save a single variable for the current user
export const saveUserVariable = async (key: string, value: string): Promise<ApiResponse> => {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}/variables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ key, value }),
  });

  return response.json();
};

// Delete a variable for the current user
export const deleteUserVariable = async (key: string): Promise<ApiResponse> => {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}/variables/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  return response.json();
};

// Convert variables object to array format for UI
export const variablesToArray = (variables: Record<string, string>): SavedVariable[] => {
  return Object.entries(variables).map(([key, value]) => ({ key, value }));
};

// Convert variables array to object format for API
export const variablesToObject = (variables: SavedVariable[]): Record<string, string> => {
  return variables.reduce((acc, { key, value }) => {
    if (key.trim()) {
      acc[key.trim()] = value;
    }
    return acc;
  }, {} as Record<string, string>);
};
