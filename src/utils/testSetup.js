const GeminiLiveService = require('../services/GeminiLiveService');
const config = require('../config/environment');
const logger = require('./logger');

// Test script to verify backend setup
async function testSetup() {
  console.log('\n🔍 Testing Sova Backend Setup...\n');

  // Test 1: Environment Configuration
  console.log('1️⃣  Checking Environment Configuration...');
  try {
    console.log(`   ✅ GEMINI_API_KEY: ${config.gemini.apiKey ? 'Configured' : '❌ Missing'}`);
    console.log(`   ✅ Server Port: ${config.server.port}`);
    console.log(`   ✅ Environment: ${config.server.env}`);
    console.log(`   ✅ Gemini Model: ${config.gemini.model}`);
  } catch (error) {
    console.error('   ❌ Configuration Error:', error.message);
    process.exit(1);
  }

  // Test 2: Logger
  console.log('\n2️⃣  Testing Logger...');
  try {
    logger.info('Test log message');
    console.log('   ✅ Logger is working');
  } catch (error) {
    console.error('   ❌ Logger Error:', error.message);
  }

  // Test 3: Gemini Live API Connection
  console.log('\n3️⃣  Testing Gemini Live API Connection...');
  try {
    const geminiLiveService = new GeminiLiveService();
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const validation = await geminiLiveService.validateConfiguration();
    
    if (validation.isValid) {
      console.log('   ✅ Gemini Live API connection successful');
      console.log(`   ✅ Model: ${validation.model}`);
      console.log(`   ✅ Voice: ${validation.voice}`);
      console.log(`   ✅ Connected: ${validation.isConnected}`);
    } else {
      console.error('   ❌ Gemini Live API Error:', validation.error);
    }
  } catch (error) {
    console.error('   ❌ Failed to connect to Gemini Live API:', error.message);
  }

  // Test 4: Test Live API functionality
  console.log('\n4️⃣  Testing Live API Functionality...');
  try {
    const geminiLiveService = new GeminiLiveService();
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (geminiLiveService.isConnected) {
      console.log('   ✅ Live API session is connected');
      
      // Test text input
      await geminiLiveService.sendTextInput('Hello, this is a test message.', 'test-session');
      console.log('   ✅ Text input sent successfully');
    } else {
      console.log('   ⚠️  Live API session not connected, skipping text test');
    }
  } catch (error) {
    console.error('   ❌ Live API Test Error:', error.message);
  }

  console.log('\n✨ Setup test complete!\n');
  console.log('Next steps:');
  console.log('1. Run `npm run dev` to start the server');
  console.log('2. Connect a WebSocket client to test real-time features');
  console.log('3. Check the health endpoint at http://localhost:3000/api/health\n');
}

// Run the test
if (require.main === module) {
  testSetup().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = testSetup; 