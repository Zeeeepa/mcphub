/**
 * Frontend Worker for MCPhub
 * 
 * This worker serves the frontend static assets from the MCPhub backend server.
 * It's optimized for serving HTML, CSS, JS, and other static assets.
 */

// Configuration (overridden by environment variables)
const config = {
  // MCPhub backend URL
  MCPHUB_BACKEND_URL: MCPHUB_BACKEND_URL || 'http://localhost:3001',
  
  // Allowed origins for CORS
  ALLOWED_ORIGINS: ALLOWED_ORIGINS || '*',

  // API key for authentication
  MCPHUB_API_KEY: MCPHUB_API_KEY || 'API_KEY_PLACEHOLDER',
};

// Event handler for incoming requests
addEventListener('fetch', event => {
  try {
    // Handle the request
    event.respondWith(handleRequest(event.request));
  } catch (err) {
    // Return error response
    event.respondWith(new Response(JSON.stringify({
      error: `Frontend Worker error: ${err.message}`
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(event.request)
      }
    }));
  }
});

/**
 * Handle incoming requests
 * @param {Request} request - The incoming request
 * @returns {Promise<Response>} - The response
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return handleCors(request);
  }
  
  // Handle health check
  if (path === '/health') {
    return new Response(JSON.stringify({
      status: 'ok',
      worker: 'mcphub-frontend-worker',
      version: '1.0.0',
      backend: config.MCPHUB_BACKEND_URL
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(request)
      }
    });
  }

  // Forward request to backend
  try {
    // Create backend URL
    const backendUrl = new URL(path + url.search, config.MCPHUB_BACKEND_URL);
    
    // Create backend request
    const backendRequest = new Request(backendUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow'
    });
    
    // Remove host header to avoid conflicts
    backendRequest.headers.delete('host');
    
    // Send request to backend
    const response = await fetch(backendRequest);
    
    // Get content type
    const contentType = response.headers.get('content-type') || '';
    
    // Create response with CORS headers
    const responseInit = {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    };
    
    // Add CORS headers
    Object.entries(getCorsHeaders(request)).forEach(([key, value]) => {
      responseInit.headers.set(key, value);
    });
    
    // Add caching headers for static assets
    if (path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
      responseInit.headers.set('Cache-Control', 'public, max-age=3600');
    }
    
    // Return response
    return new Response(response.body, responseInit);
  } catch (err) {
    // Return error response
    return new Response(JSON.stringify({
      error: `Backend connection error: ${err.message}`,
      backend_url: config.MCPHUB_BACKEND_URL
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(request)
      }
    });
  }
}

/**
 * Handle CORS preflight requests
 * @param {Request} request - The incoming request
 * @returns {Response} - The CORS response
 */
function handleCors(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request)
  });
}

/**
 * Get CORS headers for a request
 * @param {Request} request - The incoming request
 * @returns {Object} - CORS headers
 */
function getCorsHeaders(request) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = config.ALLOWED_ORIGINS.split(',');
  
  // Check if origin is allowed
  const allowOrigin = allowedOrigins.includes('*') ? 
                     '*' : 
                     (origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || '*');
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, x-auth-token',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true'
  };
}

