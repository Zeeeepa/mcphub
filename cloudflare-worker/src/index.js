/**
 * MCPhub Cloudflare Worker
 * 
 * This worker proxies requests to the MCPhub SSE endpoint, handling CORS,
 * authentication, and connection management for Server-Sent Events.
 */

// Configuration (overridden by environment variables)
const config = {
  // Backend MCPhub server URL
  MCPHUB_BACKEND_URL: 'http://localhost:3000',
  
  // Allowed origins for CORS
  ALLOWED_ORIGINS: '*',
  
  // API key for authentication (if needed)
  MCPHUB_API_KEY: null,
  
  // Connection timeouts
  CONNECT_TIMEOUT_MS: 30000,
  
  // Debug mode
  DEBUG: false
};

/**
 * Main request handler
 */
export default {
  async fetch(request, env, ctx) {
    // Apply environment variables to config
    applyEnvConfig(env);
    
    // Parse request URL
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Handle preflight CORS requests
    if (request.method === 'OPTIONS') {
      return handleCors(request);
    }
    
    // Handle health check
    if (path === '/health') {
      return new Response(JSON.stringify({ status: 'ok', worker: 'mcphub-cloudflare' }), {
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(request)
        }
      });
    }
    
    // Handle SSE endpoint
    if (path === '/sse') {
      return handleSseRequest(request, env);
    }
    
    // Forward all other requests to backend
    return forwardRequest(request, env);
  }
};

/**
 * Apply environment variables to configuration
 */
function applyEnvConfig(env) {
  if (env.MCPHUB_BACKEND_URL) {
    config.MCPHUB_BACKEND_URL = env.MCPHUB_BACKEND_URL;
  }
  
  if (env.ALLOWED_ORIGINS) {
    config.ALLOWED_ORIGINS = env.ALLOWED_ORIGINS;
  }
  
  if (env.MCPHUB_API_KEY) {
    config.MCPHUB_API_KEY = env.MCPHUB_API_KEY;
  }
  
  if (env.DEBUG === 'true') {
    config.DEBUG = true;
  }
}

/**
 * Handle CORS preflight requests
 */
function handleCors(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request)
  });
}

/**
 * Get CORS headers for responses
 */
function getCorsHeaders(request) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = config.ALLOWED_ORIGINS.split(',');
  
  // Check if origin is allowed
  const allowOrigin = allowedOrigins.includes('*') || 
                     (origin && allowedOrigins.includes(origin)) ? 
                     origin : allowedOrigins[0];
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true'
  };
}

/**
 * Handle SSE (Server-Sent Events) requests
 */
async function handleSseRequest(request, env) {
  // Validate authentication if API key is configured
  if (config.MCPHUB_API_KEY) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(request)
        }
      });
    }
    
    const token = authHeader.split(' ')[1];
    if (token !== config.MCPHUB_API_KEY) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(request)
        }
      });
    }
  }
  
  // Create backend SSE URL
  const backendUrl = new URL('/sse', config.MCPHUB_BACKEND_URL);
  
  // Forward query parameters
  const url = new URL(request.url);
  url.searchParams.forEach((value, key) => {
    backendUrl.searchParams.append(key, value);
  });
  
  // Create headers for backend request
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    // Skip host header to avoid conflicts
    if (key.toLowerCase() !== 'host') {
      headers.append(key, value);
    }
  });
  
  // Add API key if configured
  if (config.MCPHUB_API_KEY) {
    headers.set('Authorization', `Bearer ${config.MCPHUB_API_KEY}`);
  }
  
  try {
    // Fetch from backend with streaming enabled
    const response = await fetch(backendUrl.toString(), {
      method: 'GET',
      headers,
      cf: {
        // Optimize for streaming content
        cacheTtl: 0,
        cacheEverything: false,
        minify: false,
        scrapeShield: false,
        apps: false,
        resolveOverride: new URL(config.MCPHUB_BACKEND_URL).hostname
      }
    });
    
    // Check if response is successful
    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Backend error: ${response.status}` }), 
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(request)
          }
        }
      );
    }
    
    // Create response headers
    const responseHeaders = new Headers();
    
    // Add SSE headers
    responseHeaders.set('Content-Type', 'text/event-stream');
    responseHeaders.set('Cache-Control', 'no-cache');
    responseHeaders.set('Connection', 'keep-alive');
    
    // Add CORS headers
    Object.entries(getCorsHeaders(request)).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });
    
    // Return streaming response
    return new Response(response.body, {
      headers: responseHeaders
    });
  } catch (error) {
    // Handle connection errors
    return new Response(
      JSON.stringify({ error: `Connection error: ${error.message}` }), 
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(request)
        }
      }
    );
  }
}

/**
 * Forward request to backend
 */
async function forwardRequest(request, env) {
  // Create backend URL
  const url = new URL(request.url);
  const backendUrl = new URL(url.pathname + url.search, config.MCPHUB_BACKEND_URL);
  
  // Create headers for backend request
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    // Skip host header to avoid conflicts
    if (key.toLowerCase() !== 'host') {
      headers.append(key, value);
    }
  });
  
  // Add API key if configured
  if (config.MCPHUB_API_KEY) {
    headers.set('Authorization', `Bearer ${config.MCPHUB_API_KEY}`);
  }
  
  try {
    // Forward request to backend
    const response = await fetch(backendUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
      cf: {
        // Optimize for API requests
        cacheTtl: 0,
        cacheEverything: false,
        minify: false,
        scrapeShield: false,
        apps: false,
        resolveOverride: new URL(config.MCPHUB_BACKEND_URL).hostname
      }
    });
    
    // Create response headers
    const responseHeaders = new Headers();
    
    // Copy response headers
    response.headers.forEach((value, key) => {
      // Skip content-encoding to avoid compression issues
      if (key.toLowerCase() !== 'content-encoding') {
        responseHeaders.set(key, value);
      }
    });
    
    // Add CORS headers
    Object.entries(getCorsHeaders(request)).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });
    
    // Return response
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    // Handle connection errors
    return new Response(
      JSON.stringify({ error: `Connection error: ${error.message}` }), 
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(request)
        }
      }
    );
  }
}

