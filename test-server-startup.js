const GeminiLiveService = require('./src/services/GeminiLiveService');

async function testServerStartup() {
  console.log('🚀 Testing Server Startup Logs...');
  
  const geminiLive = new GeminiLiveService();
  
  try {
    console.log('📡 Initializing Gemini Live service...');
    await geminiLive.initializeClient();
    
    console.log('💬 Starting a test conversation...');
    geminiLive.startConversation('test-startup-123');
    
    console.log('❓ Sending test message: "Who are you?"');
    await geminiLive.sendTextInput('Who are you?', 'test-startup-123');
    
    console.log('⏳ Waiting for response...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('✅ Test completed - check logs above for system prompt messages');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await geminiLive.closeSession();
    console.log('🧹 Cleanup completed');
  }
}

// Run the test
testServerStartup(); 