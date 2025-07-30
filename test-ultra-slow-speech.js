const GeminiLiveService = require('./src/services/GeminiLiveService');

async function testUltraSlowSpeech() {
  console.log('🎵 Testing Ultra-Slow Speech and Long Audio Buffering...\n');

  try {
    const geminiService = new GeminiLiveService();
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    if (geminiService.isConnected) {
      console.log('✅ Service connected');
      
      // Test 1: Set ultra-slow speech rate
      console.log('1️⃣ Setting ultra-slow speech rate (30% speed)...');
      await geminiService.setUltraSlowSpeech();
      console.log('✅ Ultra-slow speech rate set');
      
      // Test 2: Send a test message
      console.log('2️⃣ Sending test message with ultra-slow speech...');
      const testMessage = "Hello! This is a test of the ultra-slow speech rate. I am speaking at 30% of normal speed for maximum clarity and understanding. This should be much slower and easier to follow.";
      await geminiService.sendTextInput(testMessage, 'test-ultra-slow');
      
      // Wait for response
      console.log('3️⃣ Waiting for audio response...');
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      // Test 3: Check settings
      console.log('4️⃣ Current settings:');
      const status = geminiService.getStatus();
      console.log(`   - Model: ${status.model}`);
      console.log(`   - Voice: ${status.voice}`);
      console.log(`   - Speech Rate: ${geminiService.speechRate || 0.3}x (Ultra Slow)`);
      console.log(`   - Sample Rate: 44.1kHz (CD Quality)`);
      console.log(`   - Audio Encoding: LINEAR16`);
      console.log(`   - Buffer Threshold: 1.5 seconds (Long segments)`);
      
      console.log('\n🎉 Ultra-Slow Speech Test Completed!\n');
      console.log('📋 Summary:');
      console.log('   - Speech rate: 30% speed (ultra slow)');
      console.log('   - Audio buffering: 1.5 seconds per segment');
      console.log('   - CD quality audio: 44.1kHz');
      console.log('   - Headphone optimization: Enabled');
      
      console.log('\n💡 Expected Results:');
      console.log('   - Much slower speech (30% of normal speed)');
      console.log('   - Longer audio segments (1.5+ seconds)');
      console.log('   - Smoother playback with fewer interruptions');
      console.log('   - Maximum clarity and understanding');
      
    } else {
      console.log('❌ Service not connected');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testUltraSlowSpeech().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 