@echo off
REM Canvas Persistence Deployment Script for Windows
REM This script helps deploy the Cloudflare Worker for canvas persistence

echo 🎨 Canvas Persistence Deployment Script
echo =======================================

REM Check if wrangler is installed
where wrangler >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Wrangler CLI not found. Installing...
    npm install -g wrangler
)

echo 📦 Installing dependencies...
npm install

echo 🗄️ Creating KV namespaces...
echo Creating production KV namespace...
for /f "tokens=*" %%i in ('wrangler kv namespace create "CANVAS_STORAGE" --json') do set KV_OUTPUT=%%i
echo Production KV created

echo Creating preview KV namespace...
for /f "tokens=*" %%i in ('wrangler kv namespace create "CANVAS_STORAGE" --preview --json') do set PREVIEW_KV_OUTPUT=%%i
echo Preview KV created

echo 📝 Please manually update wrangler.toml with the KV namespace IDs shown above

echo 🚀 Deploying to Cloudflare Workers...
wrangler publish

echo ✅ Deployment complete!
echo.
echo 🔗 Your WebSocket URL will be:
echo    wss://place-web.^<your-subdomain^>.workers.dev/ws
echo.
echo 📋 Next steps:
echo 1. Update the CloudflareWorkerUrl in your S&box scene
echo 2. Test the connection by placing pixels in-game
echo 3. Check Cloudflare dashboard for logs and analytics
echo.
echo 💡 Useful commands:
echo    wrangler tail - View real-time logs
echo    wrangler kv key list --binding=CANVAS_STORAGE - List stored maps

pause
