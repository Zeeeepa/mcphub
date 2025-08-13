/**
 * MCPhub Cloudflare Worker
 * 
 * This worker proxies requests to the MCPhub backend server,
 * handling SSE connections and CORS headers properly.
 * It also serves the frontend static assets.
 */

// Configuration (overridden by environment variables)
const config = {
  // MCPhub backend URL
  MCPHUB_BACKEND_URL: MCPHUB_BACKEND_URL || 'http://pixeliumperfecto.co.uk:3001',
  
  // Allowed origins for CORS
  ALLOWED_ORIGINS: ALLOWED_ORIGINS || '*',

  // API key for authentication
  MCPHUB_API_KEY: MCPHUB_API_KEY || 'API SET IN MCPhub',
};

// Event handler for incoming requests
addEventListener('fetch', event => {
  try {
    // Handle the request
    event.respondWith(handleRequest(event.request));
  } catch (err) {
    // Return error response
    event.respondWith(new Response(JSON.stringify({
      error: `Worker error: ${err.message}`
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
  // Get request URL and hostname
  const url = new URL(request.url);
  const hostname = url.hostname;
  const path = url.pathname;
  
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return handleCors(request);
  }
  
  // Route based on hostname
  if (hostname === 'www.pixelium.co.uk') {
    // Frontend requests
    return handleFrontendRequest(request);
  } else if (hostname === 'api.pixelium.co.uk') {
    // API requests
    return handleApiRequest(request);
  } else {
    // Default handling (mcp.pixelium.workers.dev)
    return handleDefaultRequest(request);
  }
}

/**
 * Handle frontend requests (www.pixelium.co.uk)
 * @param {Request} request - The incoming request
 * @returns {Promise<Response>} - The response
 */
async function handleFrontendRequest(request) {
  // Forward to backend for static assets
  return forwardRequest(request);
}

/**
 * Handle API requests (api.pixelium.co.uk)
 * @param {Request} request - The incoming request
 * @returns {Promise<Response>} - The response
 */
async function handleApiRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Handle health check
  if (path === '/health') {
    return new Response(JSON.stringify({
      status: 'ok',
      worker: 'mcphub-cloudflare-worker',
      version: '1.0.0',
      backend: config.MCPHUB_BACKEND_URL
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(request)
      }
    });
  }

  // Handle API key requests
  if (path === '/api/key') {
    return new Response(JSON.stringify({
      api_key: config.MCPHUB_API_KEY
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(request)
      }
    });
  }
  
  // Forward SSE requests to backend
  if (path === '/sse') {
    return forwardRequest(request);
  }

  // Forward API requests to backend
  if (path.startsWith('/api/')) {
    return forwardRequest(request);
  }

  // Forward all other requests to backend
  return forwardRequest(request);
}

/**
 * Handle default requests (mcp.pixelium.workers.dev)
 * @param {Request} request - The incoming request
 * @returns {Promise<Response>} - The response
 */
async function handleDefaultRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Handle health check
  if (path === '/health' || path === '/') {
    return new Response(JSON.stringify({
      status: 'ok',
      worker: 'mcphub-cloudflare-worker',
      version: '1.0.0',
      backend: config.MCPHUB_BACKEND_URL,
      endpoints: {
        frontend: 'https://www.pixelium.co.uk',
        api: 'https://api.pixelium.co.uk',
        sse: 'https://api.pixelium.co.uk/sse'
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(request)
      }
    });
  }

  // Forward all other requests to backend
  return forwardRequest(request);
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

/**
 * Forward request to backend
 * @param {Request} request - The incoming request
 * @returns {Promise<Response>} - The response from the backend
 */
async function forwardRequest(request) {
  // Get request URL
  const url = new URL(request.url);
  
  // Create backend URL
  const backendUrl = new URL(url.pathname + url.search, config.MCPHUB_BACKEND_URL);
  
  // Clone request
  const backendRequest = new Request(backendUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'follow'
  });
  
  // Remove host header to avoid conflicts
  backendRequest.headers.delete('host');
  
  try {
    // Send request to backend
    const response = await fetch(backendRequest);
    
    // Check if response is SSE
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/event-stream')) {
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
    }
    
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

