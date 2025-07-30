const io = require('socket.io-client');

// Example WebSocket client for testing Sova backend
class SovaClient {
  constructor(serverUrl = 'http://localhost:3000') {
    this.serverUrl = serverUrl;
    this.socket = null;
    this.sessionId = null;
  }

  connect() {
    console.log(`🔌 Connecting to ${this.serverUrl}...`);
    
    this.socket = io(this.serverUrl, {
      auth: {
        userId: 'test-user-123'
      }
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Connection events
    this.socket.on('connect', () => {
      console.log('✅ Connected to server');
      console.log(`   Socket ID: ${this.socket.id}`);
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`❌ Disconnected: ${reason}`);
    });

    this.socket.on('error', (error) => {
      console.error('🚨 Error:', error);
    });

    // Session events
    this.socket.on('session-status', (data) => {
      console.log('📊 Session Status:', data);
      if (data.sessionId) {
        this.sessionId = data.sessionId;
      }
    });

    // Audio events
    this.socket.on('ai-speaking', (data) => {
      console.log('🗣️  AI Speaking:', data);
    });

    this.socket.on('audio-response', (data) => {
      console.log(`🎵 Audio chunk ${data.index + 1}/${data.total} received`);
    });

    this.socket.on('ai-finished', (data) => {
      console.log('✅ AI Finished:', data);
      if (data.text) {
        console.log('📝 Response text:', data.text);
      }
    });

    // Server stats
    this.socket.on('server-stats', (stats) => {
      console.log('📈 Server Stats:', stats);
    });

    this.socket.on('session-info', (info) => {
      console.log('ℹ️  Session Info:', info);
    });
  }

  // Start a voice conversation
  startConversation() {
    console.log('🎤 Starting conversation...');
    this.socket.emit('start-conversation', {
      language: 'en'
    });
  }

  // Simulate sending audio chunks
  simulateAudioStream() {
    console.log('🎵 Simulating audio stream...');
    
    // Simulate 5 audio chunks
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const fakeAudioData = Buffer.from(`audio-chunk-${i}`).toString('base64');
        this.socket.emit('audio-chunk', {
          audio: fakeAudioData
        });
        console.log(`   Sent chunk ${i + 1}/5`);
      }, i * 100);
    }

    // Signal end of speaking after all chunks
    setTimeout(() => {
      console.log('🛑 Stop speaking signal sent');
      this.socket.emit('stop-speaking');
    }, 600);
  }

  // Interrupt the AI
  interrupt() {
    console.log('✋ Interrupting AI...');
    this.socket.emit('interrupt');
  }

  // End conversation
  endConversation() {
    console.log('👋 Ending conversation...');
    this.socket.emit('end-conversation');
  }

  // Get session info
  getSessionInfo() {
    console.log('📋 Requesting session info...');
    this.socket.emit('get-session-info');
  }

  // Get server stats
  getServerStats() {
    console.log('📊 Requesting server stats...');
    this.socket.emit('get-stats');
  }

  // Disconnect
  disconnect() {
    if (this.socket) {
      console.log('🔌 Disconnecting...');
      this.socket.disconnect();
    }
  }
}

// Interactive CLI for testing
async function runInteractiveClient() {
  const client = new SovaClient();
  client.connect();

  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📱 Sova Client Test Interface');
  console.log('Commands:');
  console.log('  1 - Start conversation');
  console.log('  2 - Send audio (simulated)');
  console.log('  3 - Interrupt AI');
  console.log('  4 - End conversation');
  console.log('  5 - Get session info');
  console.log('  6 - Get server stats');
  console.log('  0 - Exit\n');

  // Example automated test sequence
  console.log('Running automated test sequence...\n');
  
  // Test sequence
  setTimeout(() => client.startConversation(), 1000);
  setTimeout(() => client.simulateAudioStream(), 2000);
  setTimeout(() => client.getSessionInfo(), 4000);
  setTimeout(() => client.getServerStats(), 5000);
  setTimeout(() => client.endConversation(), 6000);
  setTimeout(() => {
    client.disconnect();
    process.exit(0);
  }, 7000);
}

// Run if called directly
if (require.main === module) {
  runInteractiveClient().catch(console.error);
}

module.exports = SovaClient; 