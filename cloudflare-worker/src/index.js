/**
 * Cloudflare Worker for MCPhub Proxy
 * Handles MCP protocol requests and proxies them to the backend MCPhub instance
 */

// CORS headers for preflight requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, Accept',
  'Access-Control-Max-Age': '86400',
};

// SSE headers for Server-Sent Events
const sseHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, Accept',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Extract the path and determine the backend URL
    const backendUrl = env.MCPHUB_BACKEND_URL || 'http://localhost:3000';
    const path = url.pathname;
    
    // Log the request for debugging
    console.log(`[MCPhub Worker] ${request.method} ${path}`);

    try {
      // Handle different MCP endpoints
      if (path.startsWith('/sse')) {
        return handleSSERequest(request, backendUrl, env);
      } else if (path.startsWith('/api')) {
        return handleAPIRequest(request, backendUrl, env);
      } else if (path.startsWith('/tools')) {
        return handleToolRequest(request, backendUrl, env);
      } else if (path.startsWith('/health')) {
        return handleHealthCheck(request, backendUrl, env);
      } else if (path === '/' || path.startsWith('/dashboard')) {
        return handleDashboardRequest(request, backendUrl, env);
      } else {
        // Proxy all other requests to the backend
        return proxyRequest(request, backendUrl, env);
      }
    } catch (error) {
      console.error('[MCPhub Worker] Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
};

/**
 * Handle Server-Sent Events (SSE) requests for MCP protocol
 */
async function handleSSERequest(request, backendUrl, env) {
  const url = new URL(request.url);
  const backendSSEUrl = `${backendUrl}${url.pathname}${url.search}`;
  
  // Forward authentication headers
  const headers = new Headers();
  const authHeader = request.headers.get('Authorization');
  const apiKeyHeader = request.headers.get('X-API-Key');
  
  if (authHeader) {
    headers.set('Authorization', authHeader);
  }
  if (apiKeyHeader) {
    headers.set('X-API-Key', apiKeyHeader);
  }
  
  // Add any additional headers from the original request
  for (const [key, value] of request.headers.entries()) {
    if (key.toLowerCase().startsWith('x-') || key.toLowerCase() === 'user-agent') {
      headers.set(key, value);
    }
  }

  try {
    // Create the backend request
    const backendRequest = new Request(backendSSEUrl, {
      method: request.method,
      headers: headers,
      body: request.body,
    });

    // Fetch from backend with streaming support
    const response = await fetch(backendRequest);
    
    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}: ${response.statusText}`);
    }

    // Return the SSE stream with proper headers
    return new Response(response.body, {
      status: response.status,
      headers: {
        ...sseHeaders,
        // Forward any additional headers from backend
        ...Object.fromEntries(
          [...response.headers.entries()].filter(([key]) => 
            !key.toLowerCase().startsWith('access-control-') &&
            key.toLowerCase() !== 'content-type'
          )
        )
      }
    });
  } catch (error) {
    console.error('[MCPhub Worker] SSE Error:', error);
    
    // Return an SSE error event
    const errorEvent = `data: ${JSON.stringify({
      type: 'error',
      error: {
        code: 'PROXY_ERROR',
        message: 'Failed to connect to MCPhub backend',
        details: error.message
      }
    })}\n\n`;
    
    return new Response(errorEvent, {
      status: 200, // SSE should return 200 even for errors
      headers: sseHeaders
    });
  }
}

/**
 * Handle API requests
 */
async function handleAPIRequest(request, backendUrl, env) {
  return proxyRequest(request, backendUrl, env, {
    'Content-Type': 'application/json',
    ...corsHeaders
  });
}

/**
 * Handle tool execution requests
 */
async function handleToolRequest(request, backendUrl, env) {
  return proxyRequest(request, backendUrl, env, {
    'Content-Type': 'application/json',
    ...corsHeaders
  });
}

/**
 * Handle health check requests
 */
async function handleHealthCheck(request, backendUrl, env) {
  try {
    const healthUrl = `${backendUrl}/health`;
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'MCPhub-Worker/1.0'
      }
    });

    const healthData = await response.json();
    
    // Add worker information to health check
    const workerHealth = {
      ...healthData,
      worker: {
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        backend_url: backendUrl,
        worker_location: request.cf?.colo || 'unknown'
      }
    };

    return new Response(JSON.stringify(workerHealth), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error('[MCPhub Worker] Health check failed:', error);
    
    return new Response(JSON.stringify({
      status: 'unhealthy',
      worker: {
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      },
      backend: {
        status: 'unreachable',
        error: error.message
      }
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

/**
 * Handle dashboard requests
 */
async function handleDashboardRequest(request, backendUrl, env) {
  return proxyRequest(request, backendUrl, env, {
    'Content-Type': 'text/html',
    ...corsHeaders
  });
}

/**
 * Generic request proxy function
 */
async function proxyRequest(request, backendUrl, env, additionalHeaders = {}) {
  const url = new URL(request.url);
  const backendRequestUrl = `${backendUrl}${url.pathname}${url.search}`;
  
  // Forward headers from the original request
  const headers = new Headers();
  
  // Copy important headers
  for (const [key, value] of request.headers.entries()) {
    // Skip host header and cloudflare-specific headers
    if (!key.toLowerCase().startsWith('cf-') && 
        key.toLowerCase() !== 'host' &&
        key.toLowerCase() !== 'x-forwarded-for' &&
        key.toLowerCase() !== 'x-real-ip') {
      headers.set(key, value);
    }
  }
  
  // Add Cloudflare information
  if (request.cf) {
    headers.set('X-CF-Country', request.cf.country || '');
    headers.set('X-CF-Ray', request.cf.ray || '');
    headers.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '');
  }

  try {
    // Create the backend request
    const backendRequest = new Request(backendRequestUrl, {
      method: request.method,
      headers: headers,
      body: request.body,
    });

    // Fetch from backend
    const response = await fetch(backendRequest);
    
    // Create response headers
    const responseHeaders = new Headers();
    
    // Copy response headers from backend
    for (const [key, value] of response.headers.entries()) {
      responseHeaders.set(key, value);
    }
    
    // Add additional headers (like CORS)
    for (const [key, value] of Object.entries(additionalHeaders)) {
      responseHeaders.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    console.error('[MCPhub Worker] Proxy error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Backend unreachable',
      message: error.message,
      backend_url: backendUrl
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        ...additionalHeaders
      }
    });
  }
}

/**
 * Validate API key (if needed for additional security)
 */
function validateAPIKey(request, env) {
  const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '') ||
                 request.headers.get('X-API-Key') ||
                 new URL(request.url).searchParams.get('api_key');
  
  // If no API key validation is needed, return true
  if (!env.MCPHUB_API_KEY) {
    return true;
  }
  
  return apiKey === env.MCPHUB_API_KEY;
}

