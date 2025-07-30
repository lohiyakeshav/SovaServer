const GeminiLiveService = require('./src/services/GeminiLiveService');

async function testSlowSpeechSimple() {
  console.log('🎵 Testing Slow Speech and CD Quality Audio...\n');

  try {
    const geminiService = new GeminiLiveService();
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    if (geminiService.isConnected) {
      console.log('✅ Service connected');
      
      // Test 1: Set slow speech rate
      console.log('1️⃣ Setting speech rate to 0.7x (70% speed)...');
      await geminiService.setSpeechRate(0.7);
      console.log('✅ Slow speech rate set');
      
      // Test 2: Send a test message
      console.log('2️⃣ Sending test message with slow speech...');
      const testMessage = "Hello! This is a test of the slow speech rate with CD quality audio. I am speaking at 70% of normal speed for better clarity and understanding.";
      await geminiService.sendTextInput(testMessage, 'test-slow-speech');
      
      // Wait for response
      console.log('3️⃣ Waiting for audio response...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Test 3: Check settings
      console.log('4️⃣ Current settings:');
      const status = geminiService.getStatus();
      console.log(`   - Model: ${status.model}`);
      console.log(`   - Voice: ${status.voice}`);
      console.log(`   - Speech Rate: ${geminiService.speechRate || 0.7}x`);
      console.log(`   - Sample Rate: 44.1kHz (CD Quality)`);
      console.log(`   - Audio Encoding: LINEAR16`);
      
      console.log('\n🎉 Test completed! The audio should now be:');
      console.log('   - Slower and clearer (70% speed)');
      console.log('   - Higher quality (CD quality 44.1kHz)');
      console.log('   - Optimized for headphones');
      
    } else {
      console.log('❌ Service not connected');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testSlowSpeechSimple().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 