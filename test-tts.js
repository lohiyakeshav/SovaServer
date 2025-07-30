const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
require('dotenv').config();

async function testTTS() {
  console.log('🎵 Testing Google Cloud Text-to-Speech...');
  
  try {
    // Check if credentials are available
    if (!process.env.GOOGLE_CLOUD_CREDENTIALS && !process.env.GOOGLE_CLOUD_KEY_FILE) {
      console.log('⚠️  No Google Cloud credentials found');
      console.log('📋 Please set up credentials as described in TTS_SETUP_GUIDE.md');
      console.log('🔄 Falling back to simulated audio for now');
      return;
    }
    
    // Initialize TTS client
    const client = new TextToSpeechClient({
      keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE || undefined,
      credentials: process.env.GOOGLE_CLOUD_CREDENTIALS ? JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS) : undefined,
    });
    
    console.log('✅ TTS client initialized');
    
    // Test TTS request
    const request = {
      input: { text: 'Hello! I am Sova, your Revolt Motors assistant. How can I help you today?' },
      voice: {
        languageCode: 'en-US',
        name: 'en-US-Neural2-F',
        ssmlGender: 'FEMALE'
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0.0,
        volumeGainDb: 0.0
      },
    };
    
    console.log('⏳ Generating speech...');
    const [response] = await client.synthesizeSpeech(request);
    const audioContent = response.audioContent;
    
    console.log('✅ TTS test successful!');
    console.log('📊 Audio size:', audioContent.length, 'bytes');
    console.log('🎵 Audio format: MP3');
    console.log('🔊 Voice: en-US-Neural2-F (Natural Female)');
    
    // Save test audio file
    const fs = require('fs');
    fs.writeFileSync('test-tts-output.mp3', audioContent);
    console.log('💾 Test audio saved as: test-tts-output.mp3');
    console.log('🎧 Play this file to hear the TTS output');
    
  } catch (error) {
    console.error('❌ TTS test failed:', error.message);
    console.error('💡 Make sure you have:');
    console.error('   1. Enabled Text-to-Speech API');
    console.error('   2. Created service account with proper permissions');
    console.error('   3. Set up credentials in .env file');
    console.error('   4. Have billing enabled on your Google Cloud project');
  }
}

// Run the test
testTTS(); 