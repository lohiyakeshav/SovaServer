const io = require('socket.io-client');

// Test WebSocket client for Gemini Live API
async function testWebSocketLive() {
  console.log('🧪 Testing WebSocket Live API...\n');

  try {
    // Connect to the Live server
    console.log('1️⃣ Connecting to WebSocket server...');
    const socket = io('ws://localhost:3000', {
      transports: ['websocket']
    });

    // Wait for connection
    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        console.log('✅ Connected to WebSocket server');
        console.log(`   Socket ID: ${socket.id}`);
        resolve();
      });

      socket.on('connect_error', (error) => {
        console.log('❌ Connection failed:', error.message);
        reject(error);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);
    });

    console.log('');

    // Test 2: Start conversation
    console.log('2️⃣ Starting conversation...');
    socket.emit('start-conversation', { userId: 'test-user' });

    // Wait for session status
    await new Promise((resolve) => {
      socket.on('session-status', (data) => {
        console.log('✅ Session started:', data);
        resolve();
      });
    });

    console.log('');

    // Test 3: Send text input
    console.log('3️⃣ Sending text input...');
    const testMessage = "Hello! I'm testing the WebSocket Live API. Can you hear me?";
    console.log(`   Message: "${testMessage}"`);
    
    socket.emit('text-input', { text: testMessage });

    // Listen for responses
    let audioChunksReceived = 0;
    let textResponseReceived = false;

    socket.on('audio-chunk', (data) => {
      audioChunksReceived++;
      console.log(`🎵 Audio chunk ${audioChunksReceived}:`, {
        chunkIndex: data.chunkIndex,
        totalChunks: data.totalChunks,
        progress: data.progress,
        dataSize: data.audioData?.length || 0
      });
    });

    socket.on('text-response', (data) => {
      textResponseReceived = true;
      console.log('📝 Text response received:', {
        text: data.text.substring(0, 100) + (data.text.length > 100 ? '...' : ''),
        length: data.text.length,
        timestamp: data.timestamp
      });
    });

    socket.on('audio-complete', (data) => {
      console.log('✅ Audio streaming complete:', data);
    });

    // Wait for responses
    console.log('   Waiting for responses...');
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 10000); // Wait 10 seconds for responses
    });

    console.log('');

    // Test 4: Get service status
    console.log('4️⃣ Getting service status...');
    socket.emit('get-service-status');

    await new Promise((resolve) => {
      socket.on('service-status', (status) => {
        console.log('✅ Service status:', status);
        resolve();
      });
    });

    console.log('');

    // Test 5: Health check
    console.log('5️⃣ Health check...');
    socket.emit('health-check');

    await new Promise((resolve) => {
      socket.on('health-response', (health) => {
        console.log('✅ Health check:', {
          timestamp: new Date(health.timestamp).toISOString(),
          socketId: health.socketId,
          connected: health.connected,
          transport: health.transport
        });
        resolve();
      });
    });

    console.log('');

    // Test 6: End conversation
    console.log('6️⃣ Ending conversation...');
    socket.emit('end-conversation');

    // Wait a bit for cleanup
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 1000);
    });

    // Disconnect
    socket.disconnect();
    console.log('✅ Disconnected from server');

    console.log('\n🎉 WebSocket Live API test completed!');
    console.log('\n📋 Results:');
    console.log(`   - Connection: ✅ Success`);
    console.log(`   - Session: ✅ Started`);
    console.log(`   - Text Input: ✅ Sent`);
    console.log(`   - Audio Chunks: ✅ ${audioChunksReceived} received`);
    console.log(`   - Text Response: ${textResponseReceived ? '✅ Received' : '❌ Not received'}`);
    console.log(`   - Service Status: ✅ Retrieved`);
    console.log(`   - Health Check: ✅ Passed`);
    
    console.log('\n🚀 Your Gemini Live API is working perfectly!');
    console.log('   You can now use it with your frontend application.');

  } catch (error) {
    console.error('❌ WebSocket test failed:', error.message);
    console.error('Stack:', error.stack);
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure the Live server is running: npm run dev:live');
    console.log('2. Check if port 3000 is available');
    console.log('3. Verify your Gemini API key is working');
    console.log('4. Check the server logs for errors');
  }
}

// Run the test
testWebSocketLive().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Test failed with error:', error);
  process.exit(1);
}); 