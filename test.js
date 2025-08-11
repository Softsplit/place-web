#!/usr/bin/env node

/**
 * Simple test runner for the Canvas Persistence WebSocket API
 * Run with: npm test
 */

import WebSocket from 'ws';

const TEST_URL = process.env.TEST_URL || 'ws://localhost:80/ws';
const TEST_MAP_ID = 'test_map_' + Date.now();

async function runTests() {
  console.log('🧪 Starting Canvas Persistence Tests...');
  console.log(`📡 Connecting to: ${TEST_URL}`);
  
  try {
    const ws = new WebSocket(TEST_URL);
    
    return new Promise((resolve, reject) => {
      let testStep = 0;
      
      ws.on('open', () => {
        console.log('✅ Connected to WebSocket');
        
        // Test 1: Request canvas data
        testStep = 1;
        console.log('📤 Test 1: Requesting canvas data...');
        ws.send(JSON.stringify({
          Type: 'request_canvas_data',
          MapId: TEST_MAP_ID
        }));
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log(`📥 Received: ${message.Type}`);
          
          if (testStep === 1 && message.Type === 'canvas_data') {
            console.log(`✅ Test 1 passed: Canvas data received (${message.PixelData?.length || 0} pixels)`);
            
            // Test 2: Place a pixel
            testStep = 2;
            console.log('📤 Test 2: Placing test pixel...');
            ws.send(JSON.stringify({
              Type: 'pixel_update',
              MapId: TEST_MAP_ID,
              SinglePixel: {
                Position: { x: 0, y: 0 },
                Color: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },
                PlacedBy: 'test_user',
                PlacedAt: new Date().toISOString(),
                IsActive: true
              }
            }));
          }
          
          else if (testStep === 2 && message.Type === 'pixel_update_ack') {
            console.log('✅ Test 2 passed: Pixel update acknowledged');
            
            // Test 3: Save canvas
            testStep = 3;
            console.log('📤 Test 3: Saving canvas...');
            ws.send(JSON.stringify({
              Type: 'save_canvas',
              MapId: TEST_MAP_ID,
              PixelData: [{
                Position: { x: 0, y: 0 },
                Color: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },
                PlacedBy: 'test_user',
                PlacedAt: new Date().toISOString(),
                IsActive: true
              }]
            }));
          }
          
          else if (testStep === 3 && message.Type === 'save_canvas_ack') {
            console.log('✅ Test 3 passed: Canvas save acknowledged');
            console.log('🎉 All tests completed successfully!');
            ws.close();
            resolve(true);
          }
          
          else if (message.Type === 'error') {
            console.error(`❌ Server error: ${message.message}`);
            reject(new Error(message.message));
          }
        } catch (error) {
          console.error('❌ Failed to parse message:', error);
          reject(error);
        }
      });
      
      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
        reject(error);
      });
      
      ws.on('close', () => {
        console.log('🔌 WebSocket connection closed');
        if (testStep < 3) {
          reject(new Error('Tests incomplete - connection closed early'));
        }
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        console.error('❌ Tests timed out');
        ws.close();
        reject(new Error('Test timeout'));
      }, 30000);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;

if (isMainModule) {
  runTests()
    .then(() => {
      console.log('✅ All tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Tests failed:', error.message);
      process.exit(1);
    });
}

export default runTests;
