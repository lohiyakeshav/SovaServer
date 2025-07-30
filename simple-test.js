const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function simpleTest() {
  console.log('🧪 Simple Gemini API Test...');
  
  try {
    // Check API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('❌ No GEMINI_API_KEY in environment');
      return;
    }
    
    console.log('✅ API key found');
    console.log('🔑 API key (first 10 chars):', apiKey.substring(0, 10) + '...');
    
    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    console.log('✅ Model initialized');
    console.log('⏳ Making simple API call...');
    
    // Simple test with timeout
    const timeout = setTimeout(() => {
      console.error('❌ Timeout after 15 seconds');
      process.exit(1);
    }, 15000);
    
    const result = await model.generateContent('Say hello');
    const response = await result.response;
    const text = response.text();
    
    clearTimeout(timeout);
    console.log('✅ API call successful!');
    console.log('📝 Response:', text);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Error type:', error.constructor.name);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

simpleTest(); 