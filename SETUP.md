# Canvas Persistence Setup Guide

This guide explains how to set up canvas persistence using Cloudflare Workers for the sbox.place project.

## Prerequisites

1. A Cloudflare account
2. Wrangler CLI installed (`npm install -g wrangler`)
3. Your sbox.place project with the updated code

## Setup Steps

### 1. Cloudflare KV Namespace Setup

First, create a KV namespace for storing canvas data:

```bash
cd place.web
wrangler kv namespace create "CANVAS_STORAGE"
wrangler kv namespace create "CANVAS_STORAGE" --preview
```

This will output namespace IDs. Update your `wrangler.toml` file with these IDs:

```toml
[[kv_namespaces]]
binding = "CANVAS_STORAGE"
id = "your-actual-kv-namespace-id"
preview_id = "your-actual-preview-kv-namespace-id"
```

### 2. Deploy the Worker

```bash
cd place.web
wrangler deploy
```

After deployment, you'll get a URL like `https://place-web.your-subdomain.workers.dev`

### 3. Update S&box Configuration

In your S&box project, update the `PersistenceManager` component in the scene:

1. Open `Assets/scenes/minimal.scene`
2. Find the "Persistence Manager" GameObject
3. Update the `CloudflareWorkerUrl` property to your deployed worker URL:
   ```
   wss://place-web.your-subdomain.workers.dev/ws
   ```

### 4. Test the Connection

1. Start your S&box server
2. Check the console for connection messages:
   ```
   PersistenceManager: Connecting to wss://place-web.your-subdomain.workers.dev/ws
   PersistenceManager: Connected to cloud service
   ```

## Features

- **Map-specific Storage**: Each map has its own canvas data stored separately
- **Real-time Sync**: Pixel updates are synchronized in real-time across all connected clients
- **Persistent Storage**: Canvas data is stored in Cloudflare KV and persists across server restarts
- **Automatic Loading**: Canvas data is automatically loaded when a player joins a map

## Console Commands

- `place.cloudstatus` - Check connection status and current map ID
- `place.savecanvas` - Manually save current canvas to cloud (admin only)
- `place.clearcanvas` - Clear all pixels from current canvas (admin only)

## How It Works

1. **Map Identification**: The system uses the current map's identifier (from MapInstance or scene name) as a unique key
2. **WebSocket Connection**: S&box connects to the Cloudflare Worker via WebSocket
3. **Data Loading**: On connection, the client requests canvas data for the current map
4. **Real-time Updates**: When pixels are placed/removed, updates are sent to the cloud and broadcast to other clients
5. **Persistence**: All canvas data is stored in Cloudflare KV with keys like `canvas:mapname`

## Message Types

The WebSocket protocol uses these message types:

- `request_canvas_data` - Request initial canvas data for a map
- `canvas_data` - Response containing all pixels for a map
- `pixel_update` - Real-time pixel placement/removal
- `save_canvas` - Bulk save of entire canvas
- `error` - Error messages

## Troubleshooting

### Connection Issues
- Verify the WebSocket URL is correct
- Check that the Cloudflare Worker is deployed and running
- Ensure your S&box server can reach the internet

### Data Not Persisting
- Verify KV namespace is properly configured
- Check Cloudflare Worker logs for errors
- Use `place.cloudstatus` to verify connection

### Performance
- KV operations are eventually consistent (may take a few seconds to propagate globally)
- Consider implementing rate limiting for high-traffic scenarios
- Monitor your Cloudflare usage to stay within limits

## Costs

Cloudflare Workers and KV are very cost-effective:
- Workers: 100,000 requests/day free, then $0.50 per million requests
- KV: 10GB storage free, 100,000 reads/day free, 1,000 writes/day free

For a typical place server, this should fit well within the free tier.
