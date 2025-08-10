#!/bin/bash

# Canvas Persistence Deployment Script
# This script helps deploy the Cloudflare Worker for canvas persistence

echo "🎨 Canvas Persistence Deployment Script"
echo "======================================="

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -g wrangler
fi

echo "📦 Installing dependencies..."
npm install

echo "🗄️ Creating KV namespaces..."
echo "Creating production KV namespace..."
PROD_KV=$(wrangler kv namespace create "CANVAS_STORAGE" --json | jq -r '.id')
echo "Production KV ID: $PROD_KV"

echo "Creating preview KV namespace..."
PREVIEW_KV=$(wrangler kv namespace create "CANVAS_STORAGE" --preview --json | jq -r '.id')
echo "Preview KV ID: $PREVIEW_KV"

echo "📝 Updating wrangler.toml with KV namespace IDs..."
cat > wrangler.toml << EOF
name = "place-web"
main = "index.js"
compatibility_date = "2023-10-30"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "CANVAS_STORAGE"
id = "$PROD_KV"
preview_id = "$PREVIEW_KV"

[vars]
ENVIRONMENT = "production"
EOF

echo "🚀 Deploying to Cloudflare Workers..."
wrangler publish

echo "✅ Deployment complete!"
echo ""
echo "🔗 Your WebSocket URL will be:"
echo "   wss://place-web.<your-subdomain>.workers.dev/ws"
echo ""
echo "📋 Next steps:"
echo "1. Update the CloudflareWorkerUrl in your S&box scene"
echo "2. Test the connection by placing pixels in-game"
echo "3. Check Cloudflare dashboard for logs and analytics"
echo ""
echo "💡 Useful commands:"
echo "   wrangler tail - View real-time logs"
echo "   wrangler kv key list --binding=CANVAS_STORAGE - List stored maps"
