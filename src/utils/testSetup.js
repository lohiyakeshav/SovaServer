const GeminiService = require('../services/GeminiService');
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

  // Test 3: Gemini API Connection
  console.log('\n3️⃣  Testing Gemini API Connection...');
  try {
    const geminiService = new GeminiService();
    const validation = await geminiService.validateConfiguration();
    
    if (validation.isValid) {
      console.log('   ✅ Gemini API connection successful');
      console.log(`   ✅ Available models: ${validation.availableModels.length}`);
      console.log(`   ✅ Current model: ${validation.currentModel}`);
    } else {
      console.error('   ❌ Gemini API Error:', validation.error);
    }
  } catch (error) {
    console.error('   ❌ Failed to connect to Gemini API:', error.message);
  }

  // Test 4: Create test chat session
  console.log('\n4️⃣  Testing Chat Session Creation...');
  try {
    const geminiService = new GeminiService();
    const chat = await geminiService.createChatSession('test-session');
    console.log('   ✅ Chat session created successfully');
    
    // Test a simple text interaction
    const result = await chat.sendMessage('Hello, what is Revolt Motors?');
    const response = await result.response;
    console.log('   ✅ Test message sent and response received');
    console.log(`   📝 Response preview: ${response.text().substring(0, 100)}...`);
  } catch (error) {
    console.error('   ❌ Chat Session Error:', error.message);
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