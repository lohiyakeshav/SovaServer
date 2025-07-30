const GeminiService = require('./src/services/GeminiService');
require('dotenv').config();

async function testFreeTTS() {
  console.log('🎵 Testing FREE Gemini 2.5 TTS...');
  
  try {
    const geminiService = new GeminiService();
    
    // Test the new TTS
    console.log('⏳ Testing Gemini 2.5 TTS...');
    const audioData = await geminiService.simulateTextToSpeech('Hello! I am Sova, your Revolt Motors assistant. How can I help you today?');
    
    console.log('✅ TTS test successful!');
    console.log('📊 Audio data length:', audioData.length);
    console.log('🎵 Audio data type:', typeof audioData);
    console.log('🔊 First 100 chars:', audioData.substring(0, 100));
    
    // Test different voices
    console.log('\n🎭 Available voices:');
    const voices = [
      'Kore', 'Puck', 'Charon', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe',
      'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina'
    ];
    
    console.log('Voices:', voices.join(', '));
    console.log('\n💡 You can change the voice by setting TTS_VOICE in your .env file');
    console.log('Example: TTS_VOICE=Puck');
    
    console.log('\n🎉 Free TTS is working! No billing required!');
    
  } catch (error) {
    console.error('❌ TTS test failed:', error.message);
    console.error('💡 Make sure you have:');
    console.error('   1. GEMINI_API_KEY set in your .env file');
    console.error('   2. Internet connection');
    console.error('   3. Valid Gemini API key');
  }
}

testFreeTTS(); 