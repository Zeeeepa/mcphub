import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { validateApiKey } from '../config/database.js';
import { loadSettings } from '../config/database.js';
import { IUser } from '../types/index.js';

// Default secret key - in production, use an environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

interface AuthenticatedRequest extends Request {
  user?: IUser;
  apiKey?: string;
  permissions?: any;
}

// Enhanced bearer auth validation with database-backed API keys
const validateBearerAuth = async (req: AuthenticatedRequest, routingConfig: any): Promise<boolean> => {
  if (!routingConfig.enableBearerAuth) {
    return false;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7);

  // First, try the legacy bearer auth key
  if (token === routingConfig.bearerAuthKey && routingConfig.bearerAuthKey) {
    return true;
  }

  // Then, try database-backed API key validation
  try {
    const validation = await validateApiKey(token);
    if (validation.valid && validation.user) {
      req.user = validation.user;
      req.apiKey = token;
      req.permissions = validation.permissions;
      return true;
    }
  } catch (error) {
    console.error('API key validation error:', error);
  }

  return false;
};

// Enhanced API key validation for MCP server connections
const validateMcpApiKey = async (req: AuthenticatedRequest): Promise<boolean> => {
  // Check for API key in various locations
  const apiKey = req.headers['x-api-key'] || 
                 req.headers['api-key'] || 
                 req.query.api_key || 
                 req.query.apiKey;

  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  try {
    const validation = await validateApiKey(apiKey);
    if (validation.valid && validation.user) {
      req.user = validation.user;
      req.apiKey = apiKey;
      req.permissions = validation.permissions;
      return true;
    }
  } catch (error) {
    console.error('MCP API key validation error:', error);
  }

  return false;
};

const readonlyAllowPaths = ['/tools/call/', '/sse', '/mcp'];

const checkReadonly = (req: Request): boolean => {
  const defaultConfig = { readonly: process.env.READONLY === 'true' };
  
  if (!defaultConfig.readonly) {
    return true;
  }

  for (const path of readonlyAllowPaths) {
    if (req.path.includes(path)) {
      return true;
    }
  }

  return req.method === 'GET';
};

// Enhanced authentication middleware with multiple auth methods
export const enhancedAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const t = (req as any).t || ((key: string) => key);
  
  if (!checkReadonly(req)) {
    res.status(403).json({ success: false, message: t('api.errors.readonly') });
    return;
  }

  try {
    // Load current routing configuration
    const settings = await loadSettings();
    const routingConfig = settings.systemConfig?.routing || {
      enableGlobalRoute: true,
      enableGroupNameRoute: true,
      enableBearerAuth: false,
      bearerAuthKey: '',
      skipAuth: false,
    };

    // Skip auth if configured
    if (routingConfig.skipAuth) {
      next();
      return;
    }

    // Try bearer auth (including database-backed API keys)
    if (await validateBearerAuth(req, routingConfig)) {
      next();
      return;
    }

    // Try MCP-specific API key validation
    if (await validateMcpApiKey(req)) {
      next();
      return;
    }

    // Try JWT token validation (legacy)
    const headerToken = req.header('x-auth-token');
    const queryToken = req.query.token as string;
    const token = headerToken || queryToken;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = (decoded as any).user;
        next();
        return;
      } catch (error) {
        // JWT validation failed, continue to unauthorized response
      }
    }

    // No valid authentication found
    res.status(401).json({ 
      success: false, 
      message: 'Authentication required. Provide a valid API key or token.',
      details: {
        methods: [
          'Bearer token in Authorization header',
          'API key in X-API-Key header',
          'API key in api_key query parameter',
          'JWT token in x-auth-token header or token query parameter'
        ]
      }
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Authentication service error' 
    });
  }
};

// Middleware specifically for MCP server connections (SSE/WebSocket)
export const mcpAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const settings = await loadSettings();
    const routingConfig = settings.systemConfig?.routing || {
      enableBearerAuth: false,
      skipAuth: false,
    };

    // Skip auth if configured
    if (routingConfig.skipAuth) {
      next();
      return;
    }

    // For MCP connections, we're more flexible with API key locations
    const apiKey = req.headers.authorization?.replace('Bearer ', '') ||
                   req.headers['x-api-key'] ||
                   req.headers['api-key'] ||
                   req.query.api_key ||
                   req.query.apiKey ||
                   req.query.token;

    if (!apiKey || typeof apiKey !== 'string') {
      res.status(401).json({
        success: false,
        message: 'API key required for MCP server access',
        details: {
          hint: 'Add your API key to the "env" field in your MCP client configuration'
        }
      });
      return;
    }

    // Validate the API key
    const validation = await validateApiKey(apiKey);
    if (validation.valid && validation.user) {
      req.user = validation.user;
      req.apiKey = apiKey;
      req.permissions = validation.permissions;
      next();
      return;
    }

    res.status(401).json({
      success: false,
      message: 'Invalid API key',
      details: {
        hint: 'Check your API key in the MCPhub dashboard'
      }
    });
  } catch (error) {
    console.error('MCP authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication service error'
    });
  }
};

// Admin-only middleware
export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user || !req.user.isAdmin) {
    res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
    return;
  }
  next();
};

// Permission-based middleware
export const requirePermission = (permission: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.permissions) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
      return;
    }

    // Check if user has the required permission
    const hasPermission = req.permissions[permission] === true ||
                         req.permissions['*'] === true ||
                         req.permissions.admin === true;

    if (!hasPermission) {
      res.status(403).json({
        success: false,
        message: `Permission '${permission}' required`
      });
      return;
    }

    next();
  };
};

// Export the original auth middleware for backward compatibility
export const auth = enhancedAuth;

export default {
  enhancedAuth,
  mcpAuth,
  requireAdmin,
  requirePermission,
  auth,
};

