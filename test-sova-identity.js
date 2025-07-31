const GeminiLiveService = require('./src/services/GeminiLiveService');

async function testSovaIdentity() {
  console.log('🧪 Testing Sova Identity...');
  
  const geminiLive = new GeminiLiveService();
  
  try {
    // Initialize the service
    console.log('📡 Initializing Gemini Live service...');
    await geminiLive.initializeClient();
    
    // Force restart session with new system prompt
    console.log('🔄 Force restarting session with new system prompt...');
    await geminiLive.restartSessionWithNewPrompt();
    
    // Start a conversation
    console.log('💬 Starting conversation...');
    geminiLive.startConversation('test-session-123');
    
    // Test identity question
    console.log('❓ Testing identity question: "Who are you?"');
    await geminiLive.sendTextInput('Who are you?', 'test-session-123');
    
    // Wait a moment for response
    console.log('⏳ Waiting for response...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test off-topic question
    console.log('❓ Testing off-topic question: "What is the weather?"');
    await geminiLive.sendTextInput('What is the weather?', 'test-session-123');
    
    // Wait a moment for response
    console.log('⏳ Waiting for response...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('✅ Test completed');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Clean up
    await geminiLive.closeSession();
    console.log('🧹 Cleanup completed');
  }
}

// Run the test
testSovaIdentity(); 