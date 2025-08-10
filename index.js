addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})

export default {
  async fetch(request, env) {
    return handleRequest(request, env)
  },
}

async function handleSession(websocket, env) {
  websocket.accept()

  websocket.addEventListener('message', async ({ data }) => {
    try {
      // Check message size before parsing
      if (data.length > 1000000) { // 1MB limit
        console.warn('Received oversized message:', data.length, 'bytes')
        websocket.send(
          JSON.stringify({
            Type: 'error',
            message: 'Message too large',
            tz: new Date(),
          }),
        )
        return
      }

      const message = JSON.parse(data)

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
          websocket.send(
            JSON.stringify({
              Type: 'error',
              message: `Unknown message type: ${message.Type}`,
              tz: new Date(),
            }),
          )
      }
    } catch (error) {
      console.error('Error processing message:', error)
      websocket.send(
        JSON.stringify({
          Type: 'error',
          message: 'Invalid message format',
          tz: new Date(),
        }),
      )
    }
  })

  websocket.addEventListener('close', async (evt) => {
    console.log('WebSocket connection closed:', evt)
  })
}

async function handleRequestCanvasData(websocket, message, env) {
  const mapId = message.MapId

  if (!mapId) {
    websocket.send(
      JSON.stringify({
        Type: 'error',
        message: 'Map ID is required',
      }),
    )
    return
  }

  try {
    // Get canvas data for this map from KV storage
    const canvasDataJson = await env.CANVAS_STORAGE.get(`canvas:${mapId}`)
    const canvasData = canvasDataJson ? JSON.parse(canvasDataJson) : []

    const CHUNK_SIZE = 100 // pixels per chunk
    
    if (canvasData.length > CHUNK_SIZE) {
      // Send chunked data
      const totalChunks = Math.ceil(canvasData.length / CHUNK_SIZE)
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const chunk = canvasData.slice(start, start + CHUNK_SIZE)
        
        websocket.send(
          JSON.stringify({
            Type: 'canvas_data_chunk',
            MapId: mapId,
            PixelData: chunk,
            ChunkIndex: i,
            TotalChunks: totalChunks,
            IsLastChunk: i === totalChunks - 1
          }),
        )
        
        // Small delay between chunks to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 5))
      }
    } else {
      // Send all at once if small enough
      websocket.send(
        JSON.stringify({
          Type: 'canvas_data',
          MapId: mapId,
          PixelData: canvasData,
        }),
      )
    }
  } catch (error) {
    console.error('Error loading canvas data:', error)
    websocket.send(
      JSON.stringify({
        Type: 'error',
        message: 'Failed to load canvas data',
      }),
    )
  }
}

async function handlePixelUpdate(websocket, message, env) {
  const mapId = message.MapId
  const pixelData = message.SinglePixel

  if (!mapId || !pixelData) {
    websocket.send(
      JSON.stringify({
        Type: 'error',
        message: 'Map ID and pixel data are required',
      }),
    )
    return
  }

  try {
    // Get existing canvas data for this map from KV storage
    const canvasDataJson = await env.CANVAS_STORAGE.get(`canvas:${mapId}`)
    let canvasData = canvasDataJson ? JSON.parse(canvasDataJson) : []

    if (pixelData.IsActive) {
      // Find existing pixel at this position and update it, or add new one
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
      // Remove pixel at this position
      canvasData = canvasData.filter(
        (p) =>
          !(
            p.Position.x === pixelData.Position.x &&
            p.Position.y === pixelData.Position.y
          ),
      )
    }

    // Save updated data back to KV storage
    await env.CANVAS_STORAGE.put(`canvas:${mapId}`, JSON.stringify(canvasData))

    // Acknowledge the update
    websocket.send(
      JSON.stringify({
        Type: 'pixel_update_ack',
        MapId: mapId,
        SinglePixel: pixelData,
      }),
    )
  } catch (error) {
    console.error('Error updating pixel:', error)
    websocket.send(
      JSON.stringify({
        Type: 'error',
        message: 'Failed to update pixel',
      }),
    )
  }
}

async function handleSaveCanvas(websocket, message, env) {
  const mapId = message.MapId
  const pixelData = message.PixelData

  if (!mapId || !pixelData) {
    websocket.send(
      JSON.stringify({
        Type: 'error',
        message: 'Map ID and pixel data are required',
      }),
    )
    return
  }

  try {
    // Save the entire canvas for this map to KV storage
    await env.CANVAS_STORAGE.put(`canvas:${mapId}`, JSON.stringify(pixelData))

    console.log(`Saved canvas for map ${mapId}: ${pixelData.length} pixels`)

    websocket.send(
      JSON.stringify({
        Type: 'save_canvas_ack',
        MapId: mapId,
        pixelCount: pixelData.length,
      }),
    )
  } catch (error) {
    console.error('Error saving canvas:', error)
    websocket.send(
      JSON.stringify({
        Type: 'error',
        message: 'Failed to save canvas',
      }),
    )
  }
}

const websocketHandler = async (request, env) => {
  const upgradeHeader = request.headers.get('Upgrade')
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected websocket', { status: 400 })
  }

  const [client, server] = Object.values(new WebSocketPair())
  await handleSession(server, env)

  return new Response(null, {
    status: 101,
    webSocket: client,
  })
}

async function handleRequest(request, env) {
  try {
    const url = new URL(request.url)
    switch (url.pathname) {
      case '/':
        return template()
      case '/test':
      case '/test.html':
        return serveTestPage()
      case '/ws':
        return websocketHandler(request, env)
      default:
        return new Response('Not found', { status: 404 })
    }
  } catch (err) {
    return new Response(err.toString())
  }
}

function serveTestPage() {
  const testHTML = `<!DOCTYPE html>
<html>
<head>
    <title>Canvas Persistence WebSocket Test</title>
    <style>
        body { 
            font-family: monospace; 
            padding: 20px; 
            background: #1a1a1a; 
            color: #00ff00; 
        }
        button { 
            padding: 10px 20px; 
            margin: 10px; 
            background: #333; 
            color: #00ff00; 
            border: 1px solid #00ff00; 
            cursor: pointer; 
        }
        #output { 
            background: #000; 
            padding: 20px; 
            border: 1px solid #00ff00; 
            white-space: pre-wrap; 
            height: 400px; 
            overflow-y: auto; 
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <h1>🎨 Canvas Persistence WebSocket Test</h1>
    <p>Testing connection to: <strong>ws://localhost:80/ws</strong></p>
    
    <button onclick="testConnection()">🧪 Run Test</button>
    <button onclick="clearLog()">🗑️ Clear Log</button>
    
    <div id="output"></div>

    <script>
        const output = document.getElementById('output');
        
        function log(message) {
            const timestamp = new Date().toLocaleTimeString();
            output.textContent += \`\${timestamp}: \${message}\\n\`;
            output.scrollTop = output.scrollHeight;
        }
        
        function clearLog() {
            output.textContent = '';
        }
        
        function testConnection() {
            log('🧪 Starting Canvas Persistence WebSocket test...');
            
            const ws = new WebSocket('ws://localhost:80/ws');
            
            ws.onopen = () => {
                log('✅ Connected to Canvas Persistence Worker');
                
                // Test requesting canvas data
                const requestMessage = {
                    Type: "request_canvas_data",
                    MapId: "test_map"
                };
                
                log('📤 Requesting canvas data for test_map...');
                ws.send(JSON.stringify(requestMessage));
            };
            
            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                log(\`📥 Received message: \${message.Type}\`);
                
                if (message.Type === 'canvas_data') {
                    log(\`📊 Canvas data: \${message.PixelData?.length || 0} pixels\`);
                    
                    // Test placing a pixel
                    setTimeout(() => {
                        const pixelMessage = {
                            Type: "pixel_update",
                            MapId: "test_map",
                            SinglePixel: {
                                Position: { x: 0, y: 0 },
                                Color: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },
                                PlacedBy: "test_user",
                                PlacedAt: new Date().toISOString(),
                                IsActive: true
                            }
                        };
                        
                        log('🎨 Placing test pixel...');
                        ws.send(JSON.stringify(pixelMessage));
                    }, 1000);
                }
                
                if (message.Type === 'pixel_update_ack') {
                    log('✅ Pixel update acknowledged');
                    
                    // Test saving canvas
                    setTimeout(() => {
                        const saveMessage = {
                            Type: "save_canvas",
                            MapId: "test_map",
                            PixelData: [
                                {
                                    Position: { x: 0, y: 0 },
                                    Color: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },
                                    PlacedBy: "test_user",
                                    PlacedAt: new Date().toISOString(),
                                    IsActive: true
                                }
                            ]
                        };
                        
                        log('💾 Saving canvas...');
                        ws.send(JSON.stringify(saveMessage));
                    }, 1000);
                }
                
                if (message.Type === 'save_canvas_ack') {
                    log('✅ Canvas save acknowledged');
                    log('🎉 All tests completed successfully!');
                    setTimeout(() => ws.close(), 1000);
                }
                
                if (message.Type === 'error') {
                    log(\`❌ Error: \${message.message}\`);
                }
            };
            
            ws.onerror = (error) => {
                log(\`❌ WebSocket error: \${error}\`);
            };
            
            ws.onclose = () => {
                log('🔌 WebSocket connection closed');
            };
        }
    </script>
</body>
</html>`

  return new Response(testHTML, {
    headers: { 'Content-Type': 'text/html' },
  })
}
