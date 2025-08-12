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
function validateMapIdent(mapIdent) {
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

  if (!validateMapIdent(mapIdent)) {
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
          Pixels: canvasData,
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
          Pixels: canvasData,
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
        Pixels: chunk,
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
function validatePixel(pixel) {
  return (
    pixel &&
    pixel.Position &&
    typeof pixel.Position.x === 'number' &&
    typeof pixel.Position.y === 'number' &&
    pixel.Color &&
    typeof pixel.Color.r === 'number' &&
    typeof pixel.Color.g === 'number' &&
    typeof pixel.Color.b === 'number' &&
    typeof pixel.Color.a === 'number' &&
    typeof pixel.PlacedBy === 'string' &&
    typeof pixel.IsActive === 'boolean'
  )
}

/**
 * Handle pixel update with proper validation
 */
async function handlePixelUpdate(websocket, message, env) {
  const mapIdent = message.MapIdent
  const pixel = message.Pixel

  if (!validateMapIdent(mapIdent)) {
    await sendError(websocket, 'Invalid map ID format')
    return
  }

  if (!validatePixel(pixel)) {
    await sendError(websocket, 'Invalid pixel data format')
    return
  }

  try {
    if (!env || !env.CANVAS_STORAGE) {
      console.warn('CANVAS_STORAGE not available, simulating pixel update')
      await websocket.send(
        JSON.stringify({
          Type: 'pixel_update_ack',
          MapIdent: mapIdent,
          Pixel: pixel,
        }),
      )
      return
    }

    const canvasDataJson = await env.CANVAS_STORAGE.get(`canvas:${mapIdent}`)
    let canvasData = canvasDataJson ? JSON.parse(canvasDataJson) : []

    if (pixel.IsActive) {
      // Update or add pixel
      const existingIndex = canvasData.findIndex(
        (p) =>
          p.Position.x === pixel.Position.x &&
          p.Position.y === pixel.Position.y,
      )

      if (existingIndex >= 0) {
        canvasData[existingIndex] = pixel
      } else {
        canvasData.push(pixel)
      }
    } else {
      // Remove pixel
      canvasData = canvasData.filter(
        (p) =>
          !(
            p.Position.x === pixel.Position.x &&
            p.Position.y === pixel.Position.y
          ),
      )
    }

    await env.CANVAS_STORAGE.put(`canvas:${mapIdent}`, JSON.stringify(canvasData))

    await websocket.send(
      JSON.stringify({
        Type: 'pixel_update_ack',
        MapIdent: mapIdent,
        Pixel: pixel,
      }),
    )

    console.log(
      `Updated pixel for map ${mapIdent} at (${pixel.Position.x}, ${pixel.Position.y})`,
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
  const pixels = message.Pixels

  if (!validateMapIdent(mapIdent)) {
    await sendError(websocket, 'Invalid map ID format')
    return
  }

  if (!Array.isArray(pixels)) {
    await sendError(websocket, 'Pixel data must be an array')
    return
  }

  // Validate each pixel in the array
  for (const pixel of pixels) {
    if (!validatePixel(pixel)) {
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
          MapIdent: mapIdent
        }),
      )
      return
    }

    await env.CANVAS_STORAGE.put(`canvas:${mapIdent}`, JSON.stringify(pixels))

    await websocket.send(
      JSON.stringify({
        Type: 'save_canvas_ack',
        MapIdent: mapIdent
      }),
    )

    console.log(`Saved canvas for map ${mapIdent}: ${pixels.length} pixels`)
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
        return createWebSocketHandler(env)(request)
      default:
        return new Response('Not found', { status: 404 })
    }
  } catch (error) {
    console.error('Request handling error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
