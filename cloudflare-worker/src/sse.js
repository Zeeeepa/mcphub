/**
 * SSE Worker for MCPhub
 * 
 * This worker handles SSE connections to the MCPhub backend server.
 * It's specifically optimized for streaming event data.
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
      error: `SSE Worker error: ${err.message}`
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
  if (path === '/health' || path === '/') {
    return new Response(JSON.stringify({
      status: 'ok',
      worker: 'mcphub-sse-worker',
      version: '1.0.0',
      backend: config.MCPHUB_BACKEND_URL
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(request)
      }
    });
  }

  // Forward SSE requests to backend
  const sseUrl = new URL('/sse' + url.search, config.MCPHUB_BACKEND_URL);
  
  try {
    // Create backend request
    const backendRequest = new Request(sseUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow'
    });
    
    // Remove host header to avoid conflicts
    backendRequest.headers.delete('host');
    
    // Send request to backend
    const response = await fetch(backendRequest);
    
    // Create response with SSE headers
    const { readable, writable } = new TransformStream();
    
    // Pipe response body to transform stream
    response.body.pipeTo(writable);
    
    // Return response with SSE headers
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...getCorsHeaders(request)
      }
    });
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

