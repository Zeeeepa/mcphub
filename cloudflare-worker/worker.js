/**
 * Cloudflare Worker for MCPHub
 * 
 * This worker acts as a proxy between Cloudflare's edge network and your local MCP server.
 * It handles request routing, transformation, and can provide additional functionality
 * like authentication, rate limiting, and request validation.
 */
// Configuration (these values will be replaced by Cloudflare Workers environment variables)
const MCP_HOST = 'localhost:3000'; // Will be replaced by the actual host during deployment
/**
 * Main request handler
 */
async function handleRequest(request) {
  // Parse the URL to get the pathname
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Get the host from the request headers
  const host = request.headers.get('host') || '';
  
  // Create a new URL for the MCP server
  let mcp_url = new URL(request.url);
  mcp_url.host = MCP_HOST;
  
  // Forward the request to the MCP server
  const modifiedRequest = new Request(mcp_url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'follow',
  });
  
  try {
    // Fetch from the MCP server
    const response = await fetch(modifiedRequest);
    
    // Clone the response to modify it
    const modifiedResponse = new Response(response.body, response);
    
    // Add CORS headers to allow cross-origin requests
    modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
    modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    modifiedResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    
    // Ensure proper content type for SSE
    if (path.includes('/mcp') || path.includes('/sse')) {
      modifiedResponse.headers.set('Content-Type', 'text/event-stream');
      modifiedResponse.headers.set('Cache-Control', 'no-cache');
      modifiedResponse.headers.set('Connection', 'keep-alive');
    }
    
    return modifiedResponse;
  } catch (error) {
    // Handle errors
    return new Response(`Error connecting to MCP server: ${error.message}`, {
      status: 502,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
/**
 * Handle OPTIONS requests for CORS preflight
 */
function handleOptions(request) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
/**
 * Main event listener
 */
addEventListener('fetch', event => {
  const request = event.request;
  
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    event.respondWith(handleOptions(request));
    return;
  }
  
  // Handle all other requests
  event.respondWith(handleRequest(request));
});

