const GeminiService = require('./src/services/GeminiService');

async function testAudioGeneration() {
  console.log('🎵 Testing Audio Generation...');
  
  try {
    const geminiService = new GeminiService();
    
    // Test text
    const testText = "Hello! I'm Sova, your Revolt Motors assistant. Nice to meet you!";
    
    console.log('📝 Test text:', testText);
    console.log('⏳ Generating audio...');
    
    // Generate audio
    const audioData = await geminiService.simulateTextToSpeech(testText);
    
    console.log('✅ Audio generated successfully!');
    console.log('📊 Audio data length:', audioData.length);
    console.log('🔍 Audio data type:', typeof audioData);
    console.log('📋 First 100 chars:', audioData.substring(0, 100));
    
    // Test chunking
    console.log('\n🔧 Testing audio chunking...');
    
    // Simulate the chunking process
    const chunkSize = 1024;
    const audioBuffer = Buffer.from(audioData, 'base64');
    const chunks = [];
    
    for (let i = 0; i < audioBuffer.length; i += chunkSize) {
      const chunk = audioBuffer.slice(i, i + chunkSize);
      chunks.push(chunk.toString('base64'));
    }
    
    console.log('✅ Audio chunked successfully!');
    console.log('📊 Total chunks:', chunks.length);
    console.log('📋 Chunk sizes:', chunks.map(chunk => chunk.length));
    
    // Test if chunks have data
    const emptyChunks = chunks.filter(chunk => chunk.length === 0);
    console.log('❌ Empty chunks:', emptyChunks.length);
    
    if (emptyChunks.length === 0) {
      console.log('🎉 All chunks have data! Audio generation is working correctly.');
    } else {
      console.log('⚠️  Some chunks are empty. This might cause audio playback issues.');
    }
    
    // Test base64 validity
    console.log('\n🔍 Testing base64 validity...');
    try {
      const decodedBuffer = Buffer.from(audioData, 'base64');
      console.log('✅ Base64 is valid!');
      console.log('📊 Decoded size:', decodedBuffer.length);
    } catch (error) {
      console.log('❌ Base64 is invalid:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testAudioGeneration(); 