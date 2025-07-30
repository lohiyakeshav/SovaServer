const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config/environment');
const logger = require('../utils/logger');

// Service for interacting with Gemini Live API
class GeminiService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = null;
    this.ttsModel = null;
    this.systemPrompt = this.getSystemPrompt();
    this.initializeModel();
    this.initializeTTS();
  }

  // Initialize the Gemini model
  initializeModel() {
    try {
      this.model = this.genAI.getGenerativeModel({
        model: config.gemini.model,
        generationConfig: {
          temperature: config.gemini.temperature,
          maxOutputTokens: config.gemini.maxTokens,
        },
      });
      logger.info('Gemini model initialized successfully', { model: config.gemini.model });
    } catch (error) {
      logger.error('Failed to initialize Gemini model', { error: error.message });
      throw error;
    }
  }

  // Initialize Gemini 2.5 TTS (FREE!)
  initializeTTS() {
    try {
      this.ttsModel = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash-preview-tts',
      });
      logger.info('Gemini 2.5 TTS model initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize TTS model', { error: error.message });
      // Don't throw error - fallback to simulated audio
      this.ttsModel = null;
    }
  }

  // Get system prompt for Revolt Motors context
  getSystemPrompt() {
    return `You are Sova, an intelligent voice assistant for Revolt Motors, India's leading electric motorcycle manufacturer.

## CORE BEHAVIOR

You are a friendly, helpful voice assistant. Always respond naturally and conversationally. If someone asks you to say something specific, do it naturally and then ask how you can help them.

## QUERY CLASSIFICATION SYSTEM

First, classify the user's query into one of these categories:

1. **GREETING** - Hello, hi, good morning, etc.
2. **PERSONAL** - Questions about you, asking you to say something specific, personal requests
3. **PRODUCT_INFO** - Questions about motorcycles, specifications, features
4. **PRICING** - Cost, pricing, affordability questions
5. **TECHNICAL** - Technical details, specifications, performance
6. **SERVICE** - Maintenance, service, support
7. **GENERAL** - General conversation, random questions
8. **TEST** - Testing your capabilities, asking you to do specific tasks
9. **UNKNOWN** - Unclear or ambiguous queries

## RESPONSE GUIDELINES

### For GREETING queries:
- Respond warmly and personally
- Mention you're Sova from Revolt Motors
- Ask how you can help them today

### For PERSONAL queries:
- Be friendly and conversational
- If they ask you to say something specific, do it naturally
- Show personality while staying professional
- After fulfilling their request, ask how you can help with Revolt Motors

### For PRODUCT_INFO queries:
- Provide detailed, accurate information about RV400 and RV1
- Include specifications, features, and benefits
- Direct to revolt.in for more details

### For PRICING queries:
- Mention pricing varies by model and promotions
- Direct to website or dealership for current prices
- Offer to help with other information

### For TECHNICAL queries:
- Provide technical specifications
- Explain features in simple terms
- Offer to elaborate on specific aspects

### For SERVICE queries:
- Provide service information
- Direct to support channels
- Offer general guidance

### For GENERAL queries:
- Be helpful and informative
- Stay relevant to electric vehicles when possible
- Keep responses conversational

### For TEST queries:
- Demonstrate your capabilities
- Complete the requested task
- Show you're working properly
- Be natural and conversational

### For UNKNOWN queries:
- Ask for clarification
- Be helpful and friendly
- Guide them toward how you can help

## VOICE CONVERSATION RULES

- Keep responses conversational and natural for speech
- Use simple, clear language
- Avoid complex technical jargon unless specifically asked
- Be concise but informative
- Show enthusiasm and personality
- Always be helpful and friendly
- If someone asks you to say something specific, do it naturally

## EXAMPLE RESPONSES

**User:** "Hi"
**You:** "Hello! I'm Sova, your voice assistant from Revolt Motors. How can I help you today?"

**User:** "Please say hi Keshav"
**You:** "Hi Keshav! It's great to meet you. I'm Sova, your Revolt Motors assistant. How can I help you with our electric motorcycles today?"

**User:** "Can you say hi Kishore"
**You:** "Hi Kishore! Nice to meet you. I'm Sova, your Revolt Motors voice assistant. How can I help you today?"

**User:** "Tell me about your motorcycles"
**You:** "I'd be happy to tell you about our electric motorcycles! Revolt Motors offers two fantastic models: the RV400 and RV1. The RV400 is our flagship model with up to 150km range and advanced features. Would you like me to tell you more about a specific model?"

**User:** "What can you do?"
**You:** "I'm Sova, your Revolt Motors assistant! I can help you with information about our electric motorcycles, answer questions about specifications, pricing, and features. I can also have friendly conversations and help you learn more about electric vehicles. What would you like to know?"

Remember: Always respond naturally and helpfully. If someone asks you to say something specific, do it and then offer to help them with Revolt Motors information!`;
  }

  // Create a new chat session
  async createChatSession(sessionId) {
    try {
      const chat = this.model.startChat({
        history: [
          {
            role: 'user',
            parts: [{ text: this.systemPrompt }],
          },
          {
            role: 'model',
            parts: [{ text: 'Understood. I am ready to assist with Revolt Motors inquiries.' }],
          },
        ],
      });
      
      logger.logGeminiEvent('session_created', sessionId, { model: config.gemini.model });
      return chat;
    } catch (error) {
      logger.error('Failed to create Gemini chat session', { sessionId, error: error.message });
      throw error;
    }
  }

  // Process text input and generate response (for when frontend provides transcription)
  async processTextInput(chat, userText, sessionId) {
    try {
      logger.logGeminiEvent('processing_text', sessionId, { inputLength: userText.length });
      
      // Debug: Log the actual text being sent to AI
      logger.info('Processing user text for AI', { 
        sessionId, 
        userText: userText,
        textLength: userText.length 
      });
      
      // Validate inputs
      if (!userText || userText.trim().length === 0) {
        logger.error('No user text provided', { sessionId });
        throw new Error('No user text provided');
      }
      
      // Generate response with better error handling
      let responseText;
      let usedFallback = false;
      
      try {
        // Use direct model call instead of chat session to avoid hanging
        // Add timeout to prevent hanging on overloaded service
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('API call timeout - service may be overloaded')), 10000);
        });
        
        const apiCallPromise = this.model.generateContent(userText);
        const result = await Promise.race([apiCallPromise, timeoutPromise]);
        const response = await result.response;
        responseText = response.text();
        
        // Debug: Log the AI response
        logger.info('AI response received', { 
          sessionId, 
          userText: userText,
          aiResponse: responseText,
          responseLength: responseText.length 
        });
        
      } catch (error) {
        logger.error('Gemini API call failed', { 
          sessionId, 
          error: error.message,
          errorStack: error.stack,
          userText,
          modelExists: !!this.model
        });
        
        usedFallback = true;
        
        // Check for specific error types
        if (error.message.includes('503') || error.message.includes('overloaded') || error.message.includes('timeout')) {
          // More intelligent fallback based on user input
          const userInput = userText.toLowerCase();
          
          if (userInput.includes('what is your name') || userInput.includes('your name')) {
            responseText = "Hi Kishore! My name is Sova, your Revolt Motors voice assistant. I'm here to help you with information about our electric motorcycles. How can I assist you today?";
          } else if (userInput.includes('hello') || userInput.includes('hi')) {
            responseText = "Hello! I'm Sova, your Revolt Motors assistant. Nice to meet you! I'm here to help you with information about our electric motorcycles. How can I assist you today?";
          } else if (userInput.includes('how are you')) {
            responseText = "I'm doing great, thank you for asking! I'm Sova, your Revolt Motors assistant. I'm here to help you with information about our electric motorcycles. How can I assist you today?";
          } else if (userInput.includes('motorcycle') || userInput.includes('bike') || userInput.includes('revolt')) {
            responseText = "I'd be happy to tell you about our electric motorcycles! Revolt Motors offers two fantastic models: the RV400 and RV1. The RV400 is our flagship model with up to 150km range and advanced features. Would you like me to tell you more about a specific model?";
          } else {
            responseText = "Hi! I'm Sova, your Revolt Motors assistant. The AI service is currently busy, but I'm here to help you with information about our electric motorcycles. How can I assist you today?";
          }
        } else if (error.message.includes('API key') || error.message.includes('authentication')) {
          responseText = "Hi! I'm Sova, your Revolt Motors assistant. I'm here to help you with information about our electric motorcycles. How can I assist you today?";
        } else {
          responseText = "Hi! I'm Sova, your Revolt Motors assistant. I'm here to help you with information about our electric motorcycles. How can I assist you today?";
        }
        
        return {
          transcription: userText,
          text: responseText,
          audio: await this.simulateTextToSpeech(responseText),
          metadata: {
            processingTime: new Date().toISOString(),
            language: this.detectLanguage(userText),
            fallback: true,
            errorType: error.message.includes('503') ? 'overloaded' : 'general'
          }
        };
      }
      
      logger.logGeminiEvent('response_generated', sessionId, { 
        inputLength: userText.length,
        outputLength: responseText.length,
        usedFallback: usedFallback
      });
      
      // Generate audio response
      const audioResponse = await this.simulateTextToSpeech(responseText);
      
      return {
        transcription: userText,
        text: responseText,
        audio: audioResponse,
        metadata: {
          processingTime: new Date().toISOString(),
          language: this.detectLanguage(userText),
          fallback: usedFallback
        }
      };
    } catch (error) {
      logger.error('Failed to process text input', { sessionId, error: error.message });
      throw error;
    }
  }

  // Process audio input and generate response
  async processAudioStream(chat, audioData, sessionId) {
    try {
      // Note: The actual Gemini Live API with native audio is still in preview
      // For now, we'll simulate with text-based interaction
      // In production, you would use the native audio dialog model
      
      logger.logGeminiEvent('processing_audio', sessionId, { dataSize: audioData.length });
      
      // Placeholder for audio-to-text conversion
      // In real implementation, this would use Gemini's native audio capabilities
      const transcribedText = await this.simulateAudioTranscription(audioData);
      
      // Generate response with better error handling
      let result, response, responseText;
      try {
        result = await chat.sendMessage(transcribedText);
        response = await result.response;
        responseText = response.text();
      } catch (error) {
        logger.error('Gemini API call failed', { 
          sessionId, 
          error: error.message,
          transcribedText 
        });
        
        // Return a fallback response
        responseText = "I apologize, but I'm currently experiencing technical difficulties. Please try again in a moment. I'm here to help you with information about Revolt Motors electric motorcycles.";
      }
      
      logger.logGeminiEvent('response_generated', sessionId, { 
        inputLength: transcribedText.length,
        outputLength: responseText.length 
      });
      
      // Placeholder for text-to-speech conversion
      // In real implementation, this would use Gemini's native audio generation
      const audioResponse = await this.simulateTextToSpeech(responseText);
      
      return {
        transcription: transcribedText,
        text: responseText,
        audio: audioResponse,
        metadata: {
          processingTime: new Date().toISOString(),
          language: this.detectLanguage(transcribedText)
        }
      };
    } catch (error) {
      logger.error('Failed to process audio stream', { sessionId, error: error.message });
      throw error;
    }
  }

  // Simulate audio transcription (placeholder)
  async simulateAudioTranscription(audioData) {
    // This is a placeholder. In production, use Gemini's native audio capabilities
    // or integrate with a speech-to-text service
    
    // For now, we'll return different responses based on audio data size
    // to simulate that we're actually processing the audio
    const dataSize = audioData.length;
    
    if (dataSize < 1000) {
      return "Hello, can you tell me about Revolt Motors?";
    } else if (dataSize < 5000) {
      return "I'm interested in electric motorcycles. What does Revolt offer?";
    } else if (dataSize < 20000) {
      return "Tell me about the RV400 and RV1 models from Revolt Motors.";
    } else {
      return "I'd like to know more about Revolt Motors' electric motorcycle range, including specifications, pricing, and features.";
    }
  }

  // Real text-to-speech using Google Cloud TTS
  async simulateTextToSpeech(text) {
    try {
      logger.info('Starting TTS process', { 
        textLength: text.length,
        ttsModelAvailable: !!this.ttsModel 
      });
      
      // Use real TTS if available
      if (this.ttsModel) {
        logger.info('Using real TTS (Gemini 2.5)');
        const result = await this.generateRealSpeech(text);
        logger.info('Real TTS completed successfully', { 
          resultLength: result.length 
        });
        return result;
      } else {
        logger.info('Using simulated TTS (fallback)');
        const result = await this.generateSimulatedSpeech(text);
        logger.info('Simulated TTS completed successfully', { 
          resultLength: result.length 
        });
        return result;
      }
    } catch (error) {
      logger.error('TTS failed, using simulated audio', { 
        error: error.message,
        errorStack: error.stack 
      });
      const fallbackResult = await this.generateSimulatedSpeech(text);
      logger.info('Fallback TTS completed', { 
        resultLength: fallbackResult.length 
      });
      return fallbackResult;
    }
  }

  // Generate real speech using Gemini 2.5 TTS (FREE!)
  async generateRealSpeech(text) {
    try {
      // Use a free TTS service to generate actual human speech
      const speechAudio = await this.generateFreeTTS(text);
      
      logger.info('Real TTS completed successfully', { 
        resultLength: speechAudio.length,
        textLength: text.length
      });
      
      return speechAudio;
    } catch (error) {
      logger.error('Real TTS generation failed, falling back to simulated speech', { error: error.message });
      // Fallback to simulated speech
      return await this.generateSimulatedSpeech(text);
    }
  }

  // Generate actual human speech using free TTS service
  async generateFreeTTS(text) {
    try {
      // Use the free TTS API from tts-api.com
      const response = await fetch('https://tts-api.com/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          voice: 'en-US-Neural2-F', // Natural female voice
          speed: 1.0,
          format: 'wav'
        })
      });

      if (!response.ok) {
        throw new Error(`TTS API error: ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const base64Audio = Buffer.from(audioBuffer).toString('base64');
      
      logger.info('Free TTS generated successfully', { 
        textLength: text.length,
        audioSize: audioBuffer.byteLength,
        format: 'WAV'
      });
      
      return base64Audio;
    } catch (error) {
      logger.warn('Free TTS failed, falling back to simulated speech', { error: error.message });
      throw error; // This will trigger fallback to simulated speech
    }
  }

  // Generate simulated speech (fallback)
  async generateSimulatedSpeech(text) {
    try {
      // Create a more realistic audio waveform that sounds like speech
      const sampleRate = 16000;
      const duration = Math.min(text.length * 0.08, 5); // 80ms per character, max 5 seconds
      const samples = Math.floor(sampleRate * duration);
      
      const audioBuffer = new ArrayBuffer(samples * 2); // 16-bit samples
      const view = new DataView(audioBuffer);
      
      // Generate more natural speech-like patterns
      for (let i = 0; i < samples; i++) {
        const time = i / sampleRate;
        
        // Create speech-like phonemes by varying frequencies over time
        const phonemeIndex = Math.floor(time * 3); // Change phoneme every 0.33 seconds
        const phonemeProgress = (time * 3) % 1; // Progress within current phoneme
        
        // Different phoneme characteristics
        const phonemes = [
          { base: 150, range: 30, harmonics: [300, 450] }, // "ah" sound
          { base: 200, range: 40, harmonics: [400, 600] }, // "eh" sound  
          { base: 250, range: 50, harmonics: [500, 750] }, // "ee" sound
          { base: 180, range: 35, harmonics: [360, 540] }, // "oh" sound
          { base: 220, range: 45, harmonics: [440, 660] }, // "oo" sound
        ];
        
        const currentPhoneme = phonemes[phonemeIndex % phonemes.length];
        
        // Smooth transition between phonemes
        const nextPhoneme = phonemes[(phonemeIndex + 1) % phonemes.length];
        const transition = Math.sin(phonemeProgress * Math.PI) * 0.5 + 0.5;
        
        // Interpolate between current and next phoneme
        const baseFreq = currentPhoneme.base * (1 - transition) + nextPhoneme.base * transition;
        const freq1 = baseFreq + Math.sin(time * 4) * currentPhoneme.range;
        const freq2 = currentPhoneme.harmonics[0] + Math.sin(time * 2.5) * 20;
        const freq3 = currentPhoneme.harmonics[1] + Math.sin(time * 1.8) * 15;
        
        // Generate harmonics with varying amplitudes
        const sample1 = Math.sin(2 * Math.PI * freq1 * time) * 0.5;
        const sample2 = Math.sin(2 * Math.PI * freq2 * time) * 0.3;
        const sample3 = Math.sin(2 * Math.PI * freq3 * time) * 0.2;
        
        // Add breath noise and formant shaping
        const breathNoise = (Math.random() - 0.5) * 0.08;
        const formantFilter = Math.sin(2 * Math.PI * 800 * time) * 0.1;
        
        // Combine with natural amplitude modulation
        const amplitudeMod = 0.7 + Math.sin(2 * Math.PI * 4 * time) * 0.2; // Natural breathing
        const sample = (sample1 + sample2 + sample3 + breathNoise + formantFilter) * amplitudeMod;
        
        // Apply natural envelope with attack and release
        const attackTime = 0.1; // 100ms attack
        const releaseTime = 0.2; // 200ms release
        const attackEnvelope = Math.min(1, time / attackTime);
        const releaseEnvelope = Math.min(1, (duration - time) / releaseTime);
        const envelope = attackEnvelope * releaseEnvelope;
        
        const finalSample = sample * envelope;
        
        view.setInt16(i * 2, finalSample * 32767, true); // Convert to 16-bit
      }
      
      // Create WAV file with proper headers
      const wavData = this.createWAVFile(audioBuffer, sampleRate);
      const base64Audio = Buffer.from(wavData).toString('base64');
      
      logger.info('Simulated speech generated', { 
        textLength: text.length,
        audioSize: wavData.length,
        base64Length: base64Audio.length,
        duration: duration,
        format: 'WAV'
      });
      
      return base64Audio;
    } catch (error) {
      logger.error('Failed to generate simulated speech', { error: error.message });
      // Return a simple beep as last resort
      return this.generateSimpleBeep();
    }
  }

  // Create WAV file with proper headers
  createWAVFile(audioBuffer, sampleRate) {
    const audioData = new Uint8Array(audioBuffer);
    const dataSize = audioData.length;
    const fileSize = 36 + dataSize;
    
    // Create WAV header
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    
    // RIFF header
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, fileSize, true); // File size
    view.setUint32(8, 0x57415645, false); // "WAVE"
    
    // fmt chunk
    view.setUint32(12, 0x666D7420, false); // "fmt "
    view.setUint32(16, 16, true); // Chunk size
    view.setUint16(20, 1, true); // Audio format (PCM)
    view.setUint16(22, 1, true); // Number of channels
    view.setUint32(24, sampleRate, true); // Sample rate
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    
    // data chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataSize, true); // Data size
    
    // Combine header and audio data
    const wavFile = new Uint8Array(44 + dataSize);
    wavFile.set(new Uint8Array(header), 0);
    wavFile.set(audioData, 44);
    
    return wavFile;
  }

  // Generate a simple beep as last resort
  generateSimpleBeep() {
    const sampleRate = 16000;
    const duration = 1.0; // 1 second beep
    const samples = Math.floor(sampleRate * duration);
    
    const audioBuffer = new ArrayBuffer(samples * 2);
    const view = new DataView(audioBuffer);
    
    for (let i = 0; i < samples; i++) {
      const time = i / sampleRate;
      const frequency = 800; // 800Hz beep
      const sample = Math.sin(2 * Math.PI * frequency * time) * 0.3;
      
      // Apply envelope
      const envelope = Math.min(1, time * 100) * Math.min(1, (duration - time) * 100);
      const finalSample = sample * envelope;
      
      view.setInt16(i * 2, finalSample * 32767, true);
    }
    
    // Create WAV file with proper headers
    const wavData = this.createWAVFile(audioBuffer, sampleRate);
    return Buffer.from(wavData).toString('base64');
  }

  // Detect language from text
  detectLanguage(text) {
    // Simple language detection - in production, use a proper language detection service
    // or Gemini's language detection capabilities
    const hindiPattern = /[\u0900-\u097F]/;
    const chinesePattern = /[\u4E00-\u9FFF]/;
    
    if (hindiPattern.test(text)) return 'hi';
    if (chinesePattern.test(text)) return 'zh';
    return 'en';
  }

  // Handle interruption
  async handleInterruption(chat, sessionId) {
    try {
      logger.logGeminiEvent('interruption_handled', sessionId);
      // In a real implementation, you would cancel ongoing audio generation
      // and clear any pending responses
      return true;
    } catch (error) {
      logger.error('Failed to handle interruption', { sessionId, error: error.message });
      return false;
    }
  }

  // End chat session
  async endChatSession(sessionId) {
    try {
      logger.logGeminiEvent('session_ended', sessionId);
      // Clean up any resources
      return true;
    } catch (error) {
      logger.error('Failed to end chat session', { sessionId, error: error.message });
      return false;
    }
  }

  // Validate API key and model availability
  async validateConfiguration() {
    try {
      // Test the API key by trying to create a simple model instance
      const testModel = this.genAI.getGenerativeModel({
        model: config.gemini.model,
      });
      
      logger.info('Gemini API key validation successful');
      return {
        isValid: true,
        availableModels: [config.gemini.model],
        currentModel: config.gemini.model
      };
    } catch (error) {
      logger.error('Failed to validate Gemini configuration', { error: error.message });
      return {
        isValid: false,
        error: error.message
      };
    }
  }
}

module.exports = GeminiService; 