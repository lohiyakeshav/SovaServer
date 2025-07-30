const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./src/config/environment');

async function testGeminiAPI() {
  console.log('🧪 Testing Gemini API...');
  
  try {
    // Check API key
    if (!config.gemini.apiKey) {
      console.error('❌ No Gemini API key found');
      return;
    }
    
    console.log('✅ API key found');
    console.log('🔑 API key (first 10 chars):', config.gemini.apiKey.substring(0, 10) + '...');
    
    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    const model = genAI.getGenerativeModel({
      model: config.gemini.model,
      generationConfig: {
        temperature: config.gemini.temperature,
        maxOutputTokens: config.gemini.maxTokens,
      },
    });
    
    console.log('✅ Model initialized:', config.gemini.model);
    console.log('⏳ Making API call...');
    
    // Test simple message with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('API call timeout after 30 seconds')), 30000);
    });
    
    const apiCallPromise = model.generateContent('Hello, say hi to Kishore');
    
    const result = await Promise.race([apiCallPromise, timeoutPromise]);
    const response = await result.response;
    const text = response.text();
    
    console.log('✅ API call successful');
    console.log('📝 Response:', text);
    
  } catch (error) {
    console.error('❌ Gemini API test failed:', error.message);
    if (error.message.includes('timeout')) {
      console.error('💡 This suggests a network or API connectivity issue');
    }
    console.error('Stack:', error.stack);
  }
}

// Run the test
testGeminiAPI(); 