// Configuration constants
const CONFIG = {
  MAX_MESSAGE_SIZE: 1000000, // 1MB
  CHUNK_SIZE: 100, // pixels per chunk
  CHUNK_DELAY: 5, // ms between chunks
  RATE_LIMIT_REQUESTS: 100, // requests per minute
  RATE_LIMIT_WINDOW: 60000, // 1 minute in ms
}

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})

export default {
  async fetch(request, env) {
    return handleRequest(request, env)
  },
}

/**
 * Handle WebSocket session lifecycle
 */
async function handleSession(websocket, env) {
  websocket.accept()

  websocket.addEventListener('message', ({ data }) => {
    handleWebSocketMessage(websocket, data, env).catch(error => {
      console.error('Error in WebSocket session:', error)
      sendError(websocket, 'Internal server error').catch(console.error)
    })
  })

  websocket.addEventListener('close', (evt) => {
    console.log('WebSocket connection closed:', evt.code, evt.reason)
  })

  websocket.addEventListener('error', (error) => {
    console.error('WebSocket error:', error)
  })
}

/**
 * Process incoming WebSocket messages with validation
 */
async function handleWebSocketMessage(websocket, data, env) {
  // Validate message size
  if (data.length > CONFIG.MAX_MESSAGE_SIZE) {
    console.warn(`Received oversized message: ${data.length} bytes`)
    await sendError(websocket, 'Message too large')
    return
  }

  let message
  try {
    message = JSON.parse(data)
  } catch (error) {
    await sendError(websocket, 'Invalid JSON format')
    return
  }

  // Validate message structure
  if (!message.Type || typeof message.Type !== 'string') {
    await sendError(websocket, 'Missing or invalid message type')
    return
  }

  // Route message to appropriate handler
  switch (message.Type) {
    case 'request_canvas_data':
      await handleRequestCanvasData(websocket, message, env)
      break
    case 'pixel_update':
      await handlePixelUpdate(websocket, message, env)
      break
    case 'save_canvas':
      await handleSaveCanvas(websocket, message, env)
      break
    default:
      await sendError(websocket, `Unknown message type: ${message.Type}`)
  }
}

/**
 * Send standardized error response
 */
async function sendError(websocket, message) {
  try {
    await websocket.send(
      JSON.stringify({
        Type: 'error',
        Message: message
      }),
    )
  } catch (error) {
    console.error('Failed to send error message:', error)
  }
}

/**
 * Validate map ID format
 */
function validateMapId(mapIdent) {
  return (
    mapIdent &&
    typeof mapIdent === 'string' &&
    mapIdent.length > 0 &&
    mapIdent.length <= 100 &&
    /^[a-zA-Z0-9._-]+$/.test(mapIdent)
  )
}

/**
 * Handle canvas data request with proper validation and chunking
 */
async function handleRequestCanvasData(websocket, message, env) {
  const mapIdent = message.MapIdent

  if (!validateMapId(mapIdent)) {
    await sendError(websocket, 'Invalid map ID format')
    return
  }

  try {
    // Handle local development where env might be undefined
    if (!env || !env.CANVAS_STORAGE) {
      console.warn('CANVAS_STORAGE not available, using empty canvas data')
      const canvasData = []
      await websocket.send(
        JSON.stringify({
          Type: 'canvas_data',
          MapIdent: mapIdent,
          PixelData: canvasData,
        }),
      )
      return
    }

    const canvasDataJson = await env.CANVAS_STORAGE.get(`canvas:${mapIdent}`)
    const canvasData = canvasDataJson ? JSON.parse(canvasDataJson) : []

    if (canvasData.length > CONFIG.CHUNK_SIZE) {
      await sendChunkedCanvasData(websocket, mapIdent, canvasData)
    } else {
      await websocket.send(
        JSON.stringify({
          Type: 'canvas_data',
          MapIdent: mapIdent,
          PixelData: canvasData,
        }),
      )
    }

    console.log(
      `Sent canvas data for map ${mapIdent}: ${canvasData.length} pixels`,
    )
  } catch (error) {
    console.error('Error loading canvas data:', error)
    await sendError(websocket, 'Failed to load canvas data')
  }
}

/**
 * Send canvas data in chunks to prevent overwhelming the client
 */
async function sendChunkedCanvasData(websocket, mapIdent, canvasData) {
  const totalChunks = Math.ceil(canvasData.length / CONFIG.CHUNK_SIZE)

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CONFIG.CHUNK_SIZE
    const chunk = canvasData.slice(start, start + CONFIG.CHUNK_SIZE)

    await websocket.send(
      JSON.stringify({
        Type: 'canvas_data_chunk',
        MapIdent: mapIdent,
        PixelData: chunk,
        ChunkIndex: i,
        TotalChunks: totalChunks,
        IsLastChunk: i === totalChunks - 1,
      }),
    )

    // Small delay between chunks
    if (i < totalChunks - 1) {
      await new Promise((resolve) => setTimeout(resolve, CONFIG.CHUNK_DELAY))
    }
  }
}

/**
 * Validate pixel data structure
 */
function validatePixelData(pixelData) {
  return (
    pixelData &&
    pixelData.Position &&
    typeof pixelData.Position.x === 'number' &&
    typeof pixelData.Position.y === 'number' &&
    pixelData.Color &&
    typeof pixelData.Color.r === 'number' &&
    typeof pixelData.Color.g === 'number' &&
    typeof pixelData.Color.b === 'number' &&
    typeof pixelData.Color.a === 'number' &&
    typeof pixelData.PlacedBy === 'string' &&
    typeof pixelData.IsActive === 'boolean'
  )
}

/**
 * Handle pixel update with proper validation
 */
async function handlePixelUpdate(websocket, message, env) {
  const mapIdent = message.MapIdent
  const pixelData = message.SinglePixel

  if (!validateMapId(mapIdent)) {
    await sendError(websocket, 'Invalid map ID format')
    return
  }

  if (!validatePixelData(pixelData)) {
    await sendError(websocket, 'Invalid pixel data format')
    return
  }

  try {
    // Handle local development where env might be undefined
    if (!env || !env.CANVAS_STORAGE) {
      console.warn('CANVAS_STORAGE not available, simulating pixel update')
      await websocket.send(
        JSON.stringify({
          Type: 'pixel_update_ack',
          MapIdent: mapIdent,
          SinglePixel: pixelData,
        }),
      )
      return
    }

    const canvasDataJson = await env.CANVAS_STORAGE.get(`canvas:${mapIdent}`)
    let canvasData = canvasDataJson ? JSON.parse(canvasDataJson) : []

    if (pixelData.IsActive) {
      // Update or add pixel
      const existingIndex = canvasData.findIndex(
        (p) =>
          p.Position.x === pixelData.Position.x &&
          p.Position.y === pixelData.Position.y,
      )

      if (existingIndex >= 0) {
        canvasData[existingIndex] = pixelData
      } else {
        canvasData.push(pixelData)
      }
    } else {
      // Remove pixel
      canvasData = canvasData.filter(
        (p) =>
          !(
            p.Position.x === pixelData.Position.x &&
            p.Position.y === pixelData.Position.y
          ),
      )
    }

    await env.CANVAS_STORAGE.put(`canvas:${mapIdent}`, JSON.stringify(canvasData))

    await websocket.send(
      JSON.stringify({
        Type: 'pixel_update_ack',
        MapIdent: mapIdent,
        SinglePixel: pixelData,
      }),
    )

    console.log(
      `Updated pixel for map ${mapIdent} at (${pixelData.Position.x}, ${pixelData.Position.y})`,
    )
  } catch (error) {
    console.error('Error updating pixel:', error)
    await sendError(websocket, 'Failed to update pixel')
  }
}

/**
 * Handle canvas save operation with validation
 */
async function handleSaveCanvas(websocket, message, env) {
  const mapIdent = message.MapIdent
  const pixelData = message.PixelData

  if (!validateMapId(mapIdent)) {
    await sendError(websocket, 'Invalid map ID format')
    return
  }

  if (!Array.isArray(pixelData)) {
    await sendError(websocket, 'Pixel data must be an array')
    return
  }

  // Validate each pixel in the array
  for (const pixel of pixelData) {
    if (!validatePixelData(pixel)) {
      await sendError(websocket, 'Invalid pixel data in array')
      return
    }
  }

  try {
    // Handle local development where env might be undefined
    if (!env || !env.CANVAS_STORAGE) {
      console.warn('CANVAS_STORAGE not available, simulating canvas save')
      await websocket.send(
        JSON.stringify({
          Type: 'save_canvas_ack',
          MapIdent: mapIdent,
          pixelCount: pixelData.length,
        }),
      )
      return
    }

    await env.CANVAS_STORAGE.put(`canvas:${mapIdent}`, JSON.stringify(pixelData))

    await websocket.send(
      JSON.stringify({
        Type: 'save_canvas_ack',
        MapIdent: mapIdent,
        pixelCount: pixelData.length,
      }),
    )

    console.log(`Saved canvas for map ${mapIdent}: ${pixelData.length} pixels`)
  } catch (error) {
    console.error('Error saving canvas:', error)
    await sendError(websocket, 'Failed to save canvas')
  }
}

/**
 * Create WebSocket upgrade handler
 */
function createWebSocketHandler(env) {
  return async (request) => {
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected websocket', { status: 400 })
    }

    const [client, server] = Object.values(new WebSocketPair())

    // Handle the session in the background
    handleSession(server, env).catch((error) => {
      console.error('Session handling error:', error)
    })

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }
}

/**
 * Main request handler with proper routing
 */
async function handleRequest(request, env) {
  try {
    const url = new URL(request.url)

    switch (url.pathname) {
      case '/':
        return serveIndexPage()
      case '/test':
      case '/test.html':
        return serveTestPage()
      case '/ws':
        return createWebSocketHandler(env)(request)
      default:
        return new Response('Not found', { status: 404 })
    }
  } catch (error) {
    console.error('Request handling error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}

/**
 * Serve the main index page
 */
function serveIndexPage() {
  const html = `<!DOCTYPE html>
<html>
<head>
    <title>Canvas Persistence Service</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { 
            font-family: system-ui, -apple-system, sans-serif; 
            max-width: 800px; 
            margin: 40px auto; 
            padding: 20px; 
            line-height: 1.6; 
        }
        .status { 
            background: #e8f5e8; 
            border: 1px solid #4caf50; 
            padding: 15px; 
            border-radius: 5px; 
            margin: 20px 0; 
        }
        .code { 
            background: #f5f5f5; 
            padding: 10px; 
            border-radius: 3px; 
            font-family: monospace; 
        }
    </style>
</head>
<body>
    <h1>Canvas Persistence Service</h1>
    <div class="status">
        <strong>Service is running</strong><br>
        WebSocket endpoint available at: <code>/ws</code>
    </div>
    
    <h2>Endpoints</h2>
    <ul>
        <li><strong>GET /</strong> - This page</li>
        <li><strong>GET /test</strong> - WebSocket test page</li>
        <li><strong>WebSocket /ws</strong> - Canvas persistence endpoint</li>
    </ul>
    
    <h2>WebSocket API</h2>
    <p>Send JSON messages to the WebSocket endpoint:</p>
    
    <h3>Request Canvas Data</h3>
    <div class="code">{"Type": "request_canvas_data", "MapIdent": "your_map_id"}</div>
    
    <h3>Update Pixel</h3>
    <div class="code">{"Type": "pixel_update", "MapIdent": "your_map_id", "SinglePixel": {...}}</div>
    
    <h3>Save Canvas</h3>
    <div class="code">{"Type": "save_canvas", "MapIdent": "your_map_id", "PixelData": [...]}</div>
    
    <p><a href="/test">Test the WebSocket connection</a></p>
</body>
</html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

/**
 * Serve a clean, professional test page
 */
function serveTestPage() {
  const testHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Canvas Persistence Test</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            color: #333;
        }
        
        .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.2rem;
            margin-bottom: 10px;
            font-weight: 700;
        }
        
        .controls {
            padding: 30px;
            text-align: center;
            border-bottom: 1px solid #e0e0e0;
        }
        
        button { 
            padding: 12px 24px;
            margin: 10px;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        
        .btn-secondary {
            background: #f8f9fa;
            color: #495057;
            border: 2px solid #dee2e6;
        }
        
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.2);
        }
        
        .status {
            padding: 15px 30px;
            margin: 20px 30px;
            border-radius: 8px;
            font-weight: 600;
        }
        
        .status-info { background: #d1ecf1; color: #0c5460; }
        .status-success { background: #d4edda; color: #155724; }
        .status-error { background: #f8d7da; color: #721c24; }
        
        #output { 
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 30px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9rem;
            line-height: 1.6;
            white-space: pre-wrap;
            height: 400px;
            overflow-y: auto;
            margin: 0;
        }
        
        .timestamp { color: #569cd6; }
        .log-info { color: #4ec9b0; }
        .log-success { color: #b5cea8; }
        .log-error { color: #f44747; }
        .log-warning { color: #ffcc02; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Canvas Persistence Test</h1>
            <p>WebSocket API Testing Interface</p>
        </div>
        
        <div class="controls">
            <button class="btn-primary" onclick="testConnection()">Run Full Test</button>
            <button class="btn-secondary" onclick="clearLog()">Clear Log</button>
        </div>
        
        <div class="status status-info" id="statusBar">
            Ready to test - Click "Run Full Test" to begin
        </div>
        
        <div id="output"></div>
    </div>

    <script>
        const output = document.getElementById('output');
        const statusBar = document.getElementById('statusBar');
        
        function updateStatus(message, type = 'info') {
            statusBar.className = \`status status-\${type}\`;
            statusBar.textContent = message;
        }
        
        function log(message, type = 'info') {
            const timestamp = new Date().toLocaleTimeString();
            const logClass = \`log-\${type}\`;
            output.innerHTML += \`<span class="timestamp">[\${timestamp}]</span> <span class="\${logClass}">\${message}</span>\\n\`;
            output.scrollTop = output.scrollHeight;
        }
        
        function clearLog() {
            output.innerHTML = '';
            updateStatus('Log cleared - Ready to test');
        }
        
        function testConnection() {
            clearLog();
            log('Starting Canvas Persistence WebSocket test...', 'info');
            updateStatus('Connecting to WebSocket...', 'info');
            
            const wsUrl = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const fullUrl = \`\${wsUrl}//\${window.location.host}/ws\`;
            
            log(\`Connecting to: \${fullUrl}\`, 'info');
            
            const ws = new WebSocket(fullUrl);
            let testMapId = "test_map_" + Date.now();
            
            ws.onopen = () => {
                log('Connected successfully', 'success');
                updateStatus('Connected - Running tests...', 'success');
                
                const requestMessage = {
                    Type: "request_canvas_data",
                    MapIdent: testMapId
                };
                
                log('Requesting canvas data...', 'info');
                ws.send(JSON.stringify(requestMessage));
            };
            
            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                log(\`Received: \${message.Type}\`, 'info');
                
                if (message.Type === 'canvas_data') {
                    log(\`Canvas data: \${message.PixelData?.length || 0} pixels\`, 'success');
                    
                    setTimeout(() => {
                        const pixelMessage = {
                            Type: "pixel_update",
                            MapIdent: testMapId,
                            SinglePixel: {
                                Position: { x: 0, y: 0 },
                                Color: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },
                                PlacedBy: "test_user",
                                LastModified: new Date().toISOString(),
                                IsActive: true
                            }
                        };
                        
                        log('Placing test pixel...', 'info');
                        ws.send(JSON.stringify(pixelMessage));
                    }, 500);
                }
                
                if (message.Type === 'pixel_update_ack') {
                    log('Pixel update acknowledged', 'success');
                    
                    setTimeout(() => {
                        const saveMessage = {
                            Type: "save_canvas",
                            MapIdent: testMapId,
                            PixelData: [
                                {
                                    Position: { x: 0, y: 0 },
                                    Color: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },
                                    PlacedBy: "test_user",
                                    LastModified: new Date().toISOString(),
                                    IsActive: true
                                }
                            ]
                        };
                        
                        log('Saving canvas...', 'info');
                        ws.send(JSON.stringify(saveMessage));
                    }, 500);
                }
                
                if (message.Type === 'save_canvas_ack') {
                    log('Canvas save acknowledged', 'success');
                    log('All tests completed successfully!', 'success');
                    updateStatus('All tests passed!', 'success');
                    setTimeout(() => ws.close(), 1000);
                }
                
                if (message.Type === 'error') {
                    log(\`Server error: \${message.message}\`, 'error');
                    updateStatus('Test failed - Check log', 'error');
                }
            };
            
            ws.onerror = (error) => {
                log('WebSocket connection failed', 'error');
                updateStatus('Connection failed', 'error');
            };
            
            ws.onclose = () => {
                log('Connection closed', 'warning');
            };
        }
    </script>
</body>
</html>`

  return new Response(testHTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
