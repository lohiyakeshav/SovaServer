const GeminiLiveService = require('./src/services/GeminiLiveService');
const logger = require('./src/utils/logger');

async function debugAudioData() {
  console.log('🔍 Debugging Audio Data...\n');

  try {
    // Initialize Gemini Live Service
    console.log('1️⃣ Initializing Gemini Live Service...');
    const geminiLive = new GeminiLiveService();
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('✅ Gemini Live Service initialized\n');

    // Set up callbacks to capture and analyze data
    let audioChunksReceived = 0;
    let totalDataSize = 0;
    let sampleData = null;

    geminiLive.setCallbacks({
      onAudioChunk: (audioData) => {
        audioChunksReceived++;
        totalDataSize += audioData.length;
        
        // Capture first chunk for analysis
        if (audioChunksReceived === 1) {
          sampleData = audioData;
        }
        
        console.log(`🎵 Audio chunk ${audioChunksReceived}:`, {
          dataSize: audioData.length,
          format: 'base64',
          firstChars: audioData.substring(0, 50) + '...'
        });
      },
      onTextResponse: (text) => {
        console.log('📝 Text response:', {
          text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          length: text.length
        });
      },
      onInterruption: () => {
        console.log('⏹️ Interruption received');
      }
    });

    // Send a test message
    console.log('2️⃣ Sending test message...');
    const testMessage = "Hello! This is a test message.";
    await geminiLive.sendTextInput(testMessage, 'debug-session');
    
    // Wait for responses
    console.log('3️⃣ Waiting for responses...');
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    console.log('\n4️⃣ Analyzing received data...');
    
    if (sampleData) {
      console.log('\n📊 Sample Data Analysis:');
      console.log('   Data length:', sampleData.length);
      console.log('   First 100 chars:', sampleData.substring(0, 100));
      console.log('   Last 100 chars:', sampleData.substring(sampleData.length - 100));
      
      // Try to decode and analyze
      try {
        const decodedData = Buffer.from(sampleData, 'base64');
        console.log('\n🔍 Decoded Data Analysis:');
        console.log('   Decoded length:', decodedData.length);
        console.log('   First 50 bytes (hex):', decodedData.slice(0, 50).toString('hex'));
        console.log('   First 50 bytes (ascii):', decodedData.slice(0, 50).toString('ascii'));
        
        // Check for common patterns
        const asciiString = decodedData.toString('ascii');
        const hexString = decodedData.toString('hex');
        
        console.log('\n🔍 Pattern Detection:');
        
        // Check for HTML/CSS patterns
        if (asciiString.includes('<html') || asciiString.includes('<!DOCTYPE')) {
          console.log('   ❌ DETECTED: HTML content!');
        } else if (asciiString.includes('{') && asciiString.includes('}')) {
          console.log('   ❌ DETECTED: CSS/JSON content!');
        } else if (asciiString.includes('RIFF') && asciiString.includes('WAVE')) {
          console.log('   ✅ DETECTED: WAV audio format!');
        } else if (hexString.startsWith('52494646')) { // RIFF in hex
          console.log('   ✅ DETECTED: WAV audio format (hex)!');
        } else {
          console.log('   ❓ UNKNOWN: Could not identify format');
        }
        
        // Check for audio patterns
        const hasAudioPatterns = decodedData.length > 1000 && 
                                (decodedData[0] === 0x52 && decodedData[1] === 0x49 && 
                                 decodedData[2] === 0x46 && decodedData[3] === 0x46);
        
        if (hasAudioPatterns) {
          console.log('   ✅ LIKELY: Audio data detected');
        } else {
          console.log('   ❌ UNLIKELY: Not audio data');
        }
        
      } catch (error) {
        console.log('   ❌ Failed to decode base64 data:', error.message);
      }
    }
    
    console.log('\n📈 Summary:');
    console.log(`   Total chunks received: ${audioChunksReceived}`);
    console.log(`   Total data size: ${totalDataSize} bytes`);
    console.log(`   Average chunk size: ${audioChunksReceived > 0 ? Math.round(totalDataSize / audioChunksReceived) : 0} bytes`);
    
    // Cleanup
    await geminiLive.closeSession();
    console.log('\n✅ Debug completed');

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the debug
debugAudioData().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Debug failed with error:', error);
  process.exit(1);
}); 