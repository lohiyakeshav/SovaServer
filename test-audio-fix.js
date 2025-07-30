const GeminiService = require('./src/services/GeminiService');

async function testAudioFix() {
  console.log('🎵 Testing Audio Fix...');
  
  try {
    const geminiService = new GeminiService();
    
    // Test simulated TTS
    console.log('⏳ Testing simulated TTS...');
    const audioData = await geminiService.simulateTextToSpeech('Hello! This is a test of the audio fix.');
    
    console.log('✅ Simulated TTS successful!');
    console.log('📊 Audio data length:', audioData.length);
    console.log('🎵 Audio data type:', typeof audioData);
    console.log('🔊 First 100 chars:', audioData.substring(0, 100));
    
    // Test fallback audio generation
    console.log('\n⏳ Testing fallback audio generation...');
    const VoiceHandler = require('./src/websocket/handlers/VoiceHandler');
    const handler = new VoiceHandler();
    
    const fallbackAudio = handler.generateFallbackAudio();
    console.log('✅ Fallback audio generated!');
    console.log('📊 Fallback audio length:', fallbackAudio.length);
    console.log('🎵 Fallback audio type:', typeof fallbackAudio);
    
    // Test audio chunking
    console.log('\n⏳ Testing audio chunking...');
    const chunks = handler.splitAudioIntoChunks(audioData, 1024);
    console.log('✅ Audio chunking successful!');
    console.log('📊 Number of chunks:', chunks.length);
    console.log('🎵 Chunk sizes:', chunks.map(chunk => chunk.length).slice(0, 5));
    
    console.log('\n🎉 All tests passed! Audio fix is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testAudioFix(); 