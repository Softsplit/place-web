# sbox.place - Canvas Persistence Worker

A Cloudflare Worker that provides persistent, real-time canvas storage for the sbox.place project using WebSockets and KV storage.

## 🎯 Features

- **Real-time WebSocket Communication** - Instant pixel updates across all connected clients
- **Map-based Storage** - Each map has its own isolated canvas data
- **Persistent Storage** - Canvas data stored in Cloudflare KV with global edge distribution
- **Automatic Loading** - Canvas data loads automatically when players join a map
- **Admin Interface** - Built-in test and monitoring interface

## 🚀 Quick Start

### 1. Prerequisites
- Cloudflare account
- Node.js 18+ and npm
- Wrangler CLI (`npm install -g wrangler`)

### 2. Setup
```bash
# Clone and install dependencies
git clone <your-repo>
cd place.web
npm install

# Create KV namespaces
npx wrangler kv namespace create "CANVAS_STORAGE"
npx wrangler kv namespace create "CANVAS_STORAGE" --preview

# Update wrangler.toml with the returned namespace IDs
# Deploy
npx wrangler deploy
```

### 3. Configure S&box
Update your PersistenceManager component with your worker URL:
```
wss://place-web.your-subdomain.workers.dev/ws
```

## 🧪 Testing

### Local Development
```bash
npx wrangler dev
# Visit http://localhost:80/test for WebSocket testing
```

### Production Testing
Visit your deployed worker URL at `/test` for the testing interface.

## 📡 WebSocket API

### Message Types

#### Request Canvas Data
```json
{
  "Type": "request_canvas_data",
  "MapId": "map_identifier"
}
```

#### Canvas Data Response
```json
{
  "Type": "canvas_data",
  "MapId": "map_identifier",
  "PixelData": [
    {
      "Position": { "x": 0, "y": 0 },
      "Color": { "r": 1.0, "g": 0.0, "b": 0.0, "a": 1.0 },
      "PlacedBy": "player_name",
      "LastModified": "2025-08-10T12:00:00Z",
      "IsActive": true
    }
  ]
}
```

#### Pixel Update
```json
{
  "Type": "pixel_update",
  "MapId": "map_identifier",
  "SinglePixel": {
    "Position": { "x": 0, "y": 0 },
    "Color": { "r": 1.0, "g": 0.0, "b": 0.0, "a": 1.0 },
    "PlacedBy": "player_name",
    "LastModified": "2025-08-10T12:00:00Z",
    "IsActive": true
  }
}
```

#### Save Canvas
```json
{
  "Type": "save_canvas",
  "MapId": "map_identifier",
  "PixelData": [...]
}
```

## 🏗️ Architecture

- **WebSocket Handler** - Manages real-time connections from S&box clients
- **KV Storage** - Stores canvas data with keys like `canvas:mapname`
- **Map Isolation** - Each map's canvas data is completely separate
- **Error Handling** - Comprehensive error handling and logging

## 📁 Project Structure

```
place.web/
├── index.js          # Main worker code with WebSocket handling
├── template.js       # Admin/status page template
├── wrangler.toml     # Cloudflare Worker configuration
├── package.json      # Dependencies and scripts
├── deploy.sh/.bat    # Deployment scripts
└── README.md         # This file
```

## 🛠️ Development

### Local Testing
```bash
npx wrangler dev
# Worker available at http://localhost:80
# Test interface at http://localhost:80/test
```

### Deployment
```bash
npx wrangler deploy
```

### Monitoring
```bash
npx wrangler tail  # View real-time logs
```

## 🔧 Configuration

### Environment Variables
- `ENVIRONMENT` - Set to "production" for production deployment

### KV Namespaces
- `CANVAS_STORAGE` - Stores all canvas data with map-based keys

## 🚨 Troubleshooting

### Connection Issues
- Verify WebSocket URL format (`wss://` for production, `ws://` for local)
- Check Cloudflare Worker deployment status
- Ensure KV namespace is properly configured

### Data Not Persisting
- Check KV namespace bindings in wrangler.toml
- Verify KV namespace IDs are correct
- Check worker logs for errors: `npx wrangler tail`

### Performance Issues
- Monitor KV operations in Cloudflare dashboard
- Check worker CPU usage and memory
- Consider implementing caching for frequently accessed maps

## 📈 Scaling

The worker is designed to scale automatically with Cloudflare's global network:
- **Global Edge Distribution** - KV data replicated worldwide
- **Auto-scaling** - Worker instances scale based on demand
- **High Availability** - Built-in redundancy and failover

## 🔐 Security

- Input validation on all WebSocket messages
- Optional authentication token support (configure in S&box)
- Map-based data isolation prevents cross-contamination
- Error messages don't leak sensitive information

## 📄 License

This project is licensed under the MIT License - see the LICENSE_MIT file for details.
