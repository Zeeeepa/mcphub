#!/usr/bin/env node

/**
 * Local Proxy Server for MCPhub
 * 
 * This script creates a local proxy server that forwards requests to the MCPhub backend.
 * It handles CORS headers and SSE connections properly.
 */

import http from 'http';
import https from 'https';
import url from 'url';

// Configuration
const config = {
  // Port to listen on
  PORT: process.env.PORT || 3002,
  
  // MCPhub backend URL
  MCPHUB_BACKEND_URL: process.env.MCPHUB_BACKEND_URL || 'http://localhost:3001',
  
  // Allowed origins for CORS
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '*',
  
  // Debug mode
  DEBUG: process.env.DEBUG === 'true' || false
};

// Parse backend URL
const backendUrl = new URL(config.MCPHUB_BACKEND_URL);

// Create server
const server = http.createServer((req, res) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    handleCors(req, res);
    return;
  }
  
  // Parse request URL
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  
  // Handle health check
  if (path === '/health' || path === '/') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      ...getCorsHeaders(req)
    });
    res.end(JSON.stringify({
      status: 'ok',
      proxy: 'mcphub-local-proxy',
      version: '1.0.0',
      backend: config.MCPHUB_BACKEND_URL
    }));
    return;
  }
  
  // Forward request to backend
  forwardRequest(req, res);
});

// Handle CORS preflight requests
function handleCors(req, res) {
  res.writeHead(204, getCorsHeaders(req));
  res.end();
}

// Get CORS headers
function getCorsHeaders(req) {
  const origin = req.headers.origin || '*';
  const allowedOrigins = config.ALLOWED_ORIGINS.split(',');
  
  // Check if origin is allowed
  const allowOrigin = allowedOrigins.includes('*') ? 
                     '*' : 
                     (allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || '*');
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true'
  };
}

// Forward request to backend
function forwardRequest(req, res) {
  // Parse request URL
  const parsedUrl = url.parse(req.url, true);
  
  // Create options for backend request
  const options = {
    hostname: backendUrl.hostname,
    port: backendUrl.port,
    path: parsedUrl.path,
    method: req.method,
    headers: { ...req.headers }
  };
  
  // Remove host header to avoid conflicts
  delete options.headers.host;
  
  // Log request if in debug mode
  if (config.DEBUG) {
    console.log(`Forwarding ${req.method} request to ${options.path}`);
  }
  
  // Create backend request
  const protocol = backendUrl.protocol === 'https:' ? https : http;
  const proxyReq = protocol.request(options, (proxyRes) => {
    // Handle SSE connections
    if (proxyRes.headers['content-type'] === 'text/event-stream') {
      // Set SSE headers
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...getCorsHeaders(req)
      });
      
      // Pipe response
      proxyRes.pipe(res);
    } else {
      // Set response headers
      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        ...getCorsHeaders(req)
      });
      
      // Pipe response
      proxyRes.pipe(res);
    }
  });
  
  // Handle errors
  proxyReq.on('error', (error) => {
    console.error(`Error forwarding request: ${error.message}`);
    
    res.writeHead(502, {
      'Content-Type': 'application/json',
      ...getCorsHeaders(req)
    });
    
    res.end(JSON.stringify({
      error: `Connection error: ${error.message}`,
      backend_url: config.MCPHUB_BACKEND_URL
    }));
  });
  
  // Pipe request body
  req.pipe(proxyReq);
}

// Start server
server.listen(config.PORT, () => {
  console.log(`MCPhub Local Proxy Server running on port ${config.PORT}`);
  console.log(`Forwarding requests to ${config.MCPHUB_BACKEND_URL}`);
  console.log(`Open http://localhost:${config.PORT}/sse in your browser to access MCPhub SSE endpoint`);
});

