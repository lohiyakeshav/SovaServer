const { GoogleGenAI, LiveServerMessage, Modality } = require('@google/genai');
const config = require('../config/environment');
const logger = require('../utils/logger');

// Service for Gemini 2.5 Live API with native audio support
class GeminiLiveService {
  constructor() {
    this.client = null;
    this.session = null;
    this.isConnected = false;
    this.audioQueue = [];
    this.isProcessing = false;
    this.systemPrompt = this.getSystemPrompt();
    this.currentApiKeyIndex = 0;
    this.apiKeys = this.getApiKeys();
    
    // Audio response buffering - collect multiple chunks into one complete response
    this.currentAudioResponse = {
      chunks: [],
      isComplete: false,
      startTime: null
    };
    
    // Prevent multiple simultaneous audio responses
    this.isProcessingAudioResponse = false;
    this.audioResponseQueue = [];
    
    // Continuous conversation management
    this.conversationState = {
      isActive: false,
      startTime: null,
      turnCount: 0,
      lastActivity: null,
      conversationHistory: [],
      sessionId: null,
      voiceName: null,
      speechRate: 0.8,
      isInterrupted: false
    };
    
    // Session persistence and recovery
    this.sessionManager = {
      maxSessionDuration: 30 * 60 * 1000, // 30 minutes
      sessionRefreshInterval: 5 * 60 * 1000, // 5 minutes
      autoReconnect: true,
      reconnectAttempts: 0,
      maxReconnectAttempts: 3,
      lastReconnectTime: 0
    };
    
    // Quota management
    this.quotaManager = {
      requestsPerMinute: 10, // Limit requests per minute per key
      requestsPerHour: 100,  // Limit requests per hour per key
      keyUsage: new Map(),   // Track usage per key
      lastRequestTime: new Map(), // Track last request time per key
      sessionReuseTime: 5 * 60 * 1000, // Reuse session for 5 minutes
      lastSessionTime: 0
    };
    
    this.initializeClient();
  }

  // Get all available API keys
  getApiKeys() {
    const keys = [
      config.gemini.apiKey,
      ...config.gemini.backupKeys
    ].filter(key => key && key.trim() !== '');
    
    logger.info('Available API keys', { 
      totalKeys: keys.length,
      primaryKey: keys[0] ? 'Available' : 'Missing',
      backupKeys: keys.length - 1
    });
    
    return keys;
  }

  // Initialize the Gemini Live client with fallback support
  async initializeClient() {
    try {
      await this.tryInitializeWithCurrentKey();
    } catch (error) {
      logger.error('Failed to initialize Gemini Live client with primary key', { error: error.message });
      await this.tryFallbackKeys();
    }
  }

  // Try to initialize with current API key
  async tryInitializeWithCurrentKey() {
    if (this.currentApiKeyIndex >= this.apiKeys.length) {
      throw new Error('All API keys have been exhausted');
    }

    const currentKey = this.apiKeys[this.currentApiKeyIndex];
    logger.info('Trying API key', { 
      keyIndex: this.currentApiKeyIndex + 1,
      totalKeys: this.apiKeys.length,
      keyPreview: currentKey.substring(0, 10) + '...'
    });

    this.client = new GoogleGenAI({
      apiKey: currentKey,
    });
    
    logger.info('Gemini Live client initialized successfully');
    await this.initSession();
  }

  // Try fallback API keys
  async tryFallbackKeys() {
    for (let i = 1; i < this.apiKeys.length; i++) {
      try {
        this.currentApiKeyIndex = i;
        logger.info('Trying fallback API key', { 
          keyIndex: i + 1,
          totalKeys: this.apiKeys.length,
          keyPreview: this.apiKeys[i].substring(0, 10) + '...'
        });
        
        await this.tryInitializeWithCurrentKey();
        logger.info('Successfully initialized with fallback API key', { keyIndex: i + 1 });
        return;
      } catch (error) {
        logger.warn('Fallback API key failed', { 
          keyIndex: i + 1,
          error: error.message 
        });
      }
    }
    
    // If all keys fail, throw error
    throw new Error('All API keys failed to initialize');
  }

  // Check if current API key has quota available
  checkQuota(keyIndex) {
    const key = keyIndex || this.currentApiKeyIndex;
    const now = Date.now();
    
    // Initialize usage tracking for this key
    if (!this.quotaManager.keyUsage.has(key)) {
      this.quotaManager.keyUsage.set(key, {
        minuteCount: 0,
        hourCount: 0,
        lastMinuteReset: now,
        lastHourReset: now
      });
    }
    
    const usage = this.quotaManager.keyUsage.get(key);
    
    // Reset counters if time has passed
    if (now - usage.lastMinuteReset > 60 * 1000) {
      usage.minuteCount = 0;
      usage.lastMinuteReset = now;
    }
    
    if (now - usage.lastHourReset > 60 * 60 * 1000) {
      usage.hourCount = 0;
      usage.lastHourReset = now;
    }
    
    // Check limits
    const minuteLimit = usage.minuteCount < this.quotaManager.requestsPerMinute;
    const hourLimit = usage.hourCount < this.quotaManager.requestsPerHour;
    
    if (!minuteLimit || !hourLimit) {
      logger.warn('Quota limit reached for API key', {
        keyIndex: key + 1,
        minuteCount: usage.minuteCount,
        hourCount: usage.hourCount,
        minuteLimit: this.quotaManager.requestsPerMinute,
        hourLimit: this.quotaManager.requestsPerHour
      });
      return false;
    }
    
    return true;
  }

  // Increment quota usage for current key
  incrementQuota() {
    const key = this.currentApiKeyIndex;
    const usage = this.quotaManager.keyUsage.get(key);
    
    if (usage) {
      usage.minuteCount++;
      usage.hourCount++;
      this.quotaManager.lastRequestTime.set(key, Date.now());
      
      logger.info('Quota usage updated', {
        keyIndex: key + 1,
        minuteCount: usage.minuteCount,
        hourCount: usage.hourCount
      });
    }
  }

  // Check if session can be reused
  canReuseSession() {
    const now = Date.now();
    return this.session && 
           this.isConnected && 
           (now - this.quotaManager.lastSessionTime) < this.quotaManager.sessionReuseTime;
  }

  // Handle quota exceeded error by switching to next API key
  async handleQuotaError() {
    try {
      // Mark current key as exhausted
      const currentKey = this.currentApiKeyIndex;
      const usage = this.quotaManager.keyUsage.get(currentKey);
      if (usage) {
        usage.minuteCount = this.quotaManager.requestsPerMinute;
        usage.hourCount = this.quotaManager.requestsPerHour;
      }
      
      this.currentApiKeyIndex++;
      
      if (this.currentApiKeyIndex >= this.apiKeys.length) {
        logger.error('All API keys have exceeded quota');
        return;
      }
      
      logger.info('Switching to next API key due to quota exceeded', {
        fromKey: currentKey + 1,
        toKey: this.currentApiKeyIndex + 1,
        totalKeys: this.apiKeys.length
      });
      
      // Close current session
      if (this.session) {
        try {
          await this.session.close();
        } catch (error) {
          logger.warn('Error closing session during key switch', { error: error.message });
        }
      }
      
      // Initialize with new key
      await this.tryInitializeWithCurrentKey();
      
      logger.info('Successfully switched to backup API key');
      
    } catch (error) {
      logger.error('Failed to switch API key', { error: error.message });
    }
  }

  // Initialize a new Live session
  async initSession(voiceName = null) {
    try {
      const model = 'gemini-2.0-flash-live-001';
      const voice = voiceName || config.tts?.voice || 'Orus';
      const speechRate = this.conversationState.speechRate || 0.8; // Use conversation state speech rate

      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.isConnected = true;
            this.sessionManager.reconnectAttempts = 0;
            logger.info('Gemini Live session opened successfully');
          },
          onmessage: async (message) => {
            await this.handleServerMessage(message);
          },
          onerror: (error) => {
            logger.error('Gemini Live session error', { error: error.message });
            this.isConnected = false;
            
            // Attempt auto-reconnection for continuous conversations
            if (this.sessionManager.autoReconnect && this.conversationState.isActive) {
              this.attemptReconnection();
            }
          },
          onclose: (event) => {
            logger.info('Gemini Live session closed', { reason: event.reason });
            this.isConnected = false;
            
            // Check if it's a quota error and try next API key
            if (event.reason && event.reason.includes('quota')) {
              logger.warn('Quota exceeded, attempting to switch to next API key');
              this.handleQuotaError();
            } else if (this.sessionManager.autoReconnect && this.conversationState.isActive) {
              // Attempt reconnection for continuous conversations
              this.attemptReconnection();
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { 
              prebuiltVoiceConfig: { 
                voiceName: voice
              }
            },
            languageCode: 'en-US',
            // Enhanced audio quality settings
            audioEncoding: 'LINEAR16', // Gemini Live actually returns LINEAR16 PCM
            sampleRateHertz: 48000, // Set to 48kHz for consistent sample rate
            effectsProfileId: ['headphone-class-device'], // Optimize for headphones
            // Speech rate control for natural conversation
            speakingRate: speechRate // Use conversation state speech rate
          },
        },
      });

      // Update conversation state with voice name
      this.conversationState.voiceName = voice;

      logger.info('Gemini Live session initialized', { 
        model: model,
        voice: voice,
        speechRate: speechRate,
        conversationActive: this.conversationState.isActive
      });
    } catch (error) {
      logger.error('Failed to initialize Gemini Live session', { error: error.message });
      throw error;
    }
  }

  // Handle incoming server messages (audio responses)
  async handleServerMessage(message) {
    try {
      const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData;

      if (audio) {
        logger.info('Received audio chunk from Gemini Live', {
          dataSize: audio.data.length,
          format: 'base64',
          chunksCollected: this.currentAudioResponse.chunks.length,
          isProcessing: this.isProcessingAudioResponse
        });

        // Process the audio data
        const processedAudio = await this.processAudioResponse(audio.data);
        
        // Add to current response buffer
        this.currentAudioResponse.chunks.push(processedAudio);
        
        // Start timing if this is the first chunk
        if (!this.currentAudioResponse.startTime) {
          this.currentAudioResponse.startTime = Date.now();
        }
        
        // Check if this response is complete (no more audio for 500ms)
        this.scheduleResponseCompletion();
      }

      // Handle interruptions
      const interrupted = message.serverContent?.interrupted;
      if (interrupted) {
        logger.info('Audio response interrupted by user');
        this.clearAllAudioResponses();
        
        if (this.onInterruption) {
          this.onInterruption();
        }
      }

      // Handle text responses (if any)
      const textContent = message.serverContent?.modelTurn?.parts?.find(
        part => part.text
      );
      
      if (textContent?.text) {
        logger.info('Received text response from Gemini Live', {
          text: textContent.text,
          textLength: textContent.text.length
        });
        
        if (this.onTextResponse) {
          this.onTextResponse(textContent.text);
        }
      }

    } catch (error) {
      logger.error('Failed to handle server message', { error: error.message });
    }
  }

  // Process audio response data
  async processAudioResponse(audioData) {
    try {
      // The audio data comes as base64 encoded LINEAR16 PCM
      const decodedAudio = Buffer.from(audioData, 'base64');
      
      logger.info('Received LINEAR16 PCM audio, converting to WAV format', {
        dataSize: decodedAudio.length
      });
      
      // Convert raw LINEAR16 PCM to WAV format at 48kHz
      const sampleRate = 48000; // 48kHz as configured
      const channels = 1; // Mono
      const bitsPerSample = 16; // 16-bit PCM
      
      const wavData = this.createWAVFile(decodedAudio, sampleRate, channels, bitsPerSample);
      return Buffer.from(wavData).toString('base64');
    } catch (error) {
      logger.error('Failed to process audio response', { error: error.message });
      // Return a fallback beep
      return this.generateFallbackAudio();
    }
  }

  // Create WAV file with proper headers
  createWAVFile(audioData, sampleRate, channels, bitsPerSample) {
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
    view.setUint16(22, channels, true); // Number of channels
    view.setUint32(24, sampleRate, true); // Sample rate
    view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true); // Byte rate
    view.setUint16(32, channels * (bitsPerSample / 8), true); // Block align
    view.setUint16(34, bitsPerSample, true); // Bits per sample
    
    // data chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataSize, true); // Data size
    
    // Combine header and audio data
    const wavFile = new Uint8Array(44 + dataSize);
    wavFile.set(new Uint8Array(header), 0);
    wavFile.set(audioData, 44);
    
    return wavFile;
  }

  // Generate fallback audio (simple beep)
  generateFallbackAudio() {
    const sampleRate = 44100; // CD quality sample rate
    const duration = 0.5; // 500ms beep
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
    
    // Create WAV file
    const wavData = this.createWAVFile(audioBuffer, sampleRate, 1, 16);
    return Buffer.from(wavData).toString('base64');
  }

  // Send text input to Gemini Live
  async sendTextInput(text, sessionId) {
    try {
      // Check quota before making request
      if (!this.checkQuota()) {
        logger.warn('Quota limit reached, using fallback response');
        const fallbackAudio = this.generateFallbackAudio();
        
        if (this.onAudioChunk) {
          this.onAudioChunk(fallbackAudio);
        }
        
        if (this.onTextResponse) {
          const fallbackResponse = `I'm sorry, but I've reached my usage limit for this period. I heard you say: "${text}". Please try again in a few minutes.`;
          this.onTextResponse(fallbackResponse);
        }
        
        return;
      }

      // Check if session can be reused
      if (!this.canReuseSession()) {
        logger.info('Creating new session for request');
        await this.initSession();
        this.quotaManager.lastSessionTime = Date.now();
      }

      if (!this.isConnected || !this.session) {
        logger.error('Gemini Live session not connected');
        
        // Fallback to simulated speech when API is not available
        logger.info('Using fallback simulated speech due to API unavailability');
        const fallbackAudio = this.generateFallbackAudio();
        
        // Emit audio chunk event if we have a callback
        if (this.onAudioChunk) {
          this.onAudioChunk(fallbackAudio);
        }
        
        // Emit text response event
        if (this.onTextResponse) {
          const fallbackResponse = `I'm sorry, but I'm currently experiencing technical difficulties with my speech service. I heard you say: "${text}". Please try again later when the service is available.`;
          this.onTextResponse(fallbackResponse);
        }
        
        return;
      }

      logger.info('Sending text input to Gemini Live', {
        sessionId,
        textLength: text.length,
        text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
      });

      // Clear any pending audio response before sending new input
      this.clearAllAudioResponses();

      // Record conversation turn
      this.recordTurn('text', text.length);

      // Send text input to the Live session
      await this.session.sendRealtimeInput({
        text: text
      });

      // Increment quota usage after successful request
      this.incrementQuota();

      logger.info('Text input sent successfully to Gemini Live', { 
        sessionId,
        turnCount: this.conversationState.turnCount
      });

    } catch (error) {
      logger.error('Failed to send text input to Gemini Live', {
        sessionId,
        error: error.message
      });
      
      // Fallback to simulated speech on error
      logger.info('Using fallback simulated speech due to API error');
      const fallbackAudio = this.generateFallbackAudio();
      
      // Emit audio chunk event if we have a callback
      if (this.onAudioChunk) {
        this.onAudioChunk(fallbackAudio);
      }
      
      // Emit text response event
      if (this.onTextResponse) {
        const fallbackResponse = `I'm sorry, but I'm currently experiencing technical difficulties. I heard you say: "${text}". Please try again later.`;
        this.onTextResponse(fallbackResponse);
      }
    }
  }

  // Send audio input to Gemini Live
  async sendAudioInput(audioData, sessionId) {
    try {
      if (!this.isConnected || !this.session) {
        logger.error('Gemini Live session not connected');
        throw new Error('Session not connected');
      }

      logger.info('Sending audio input to Gemini Live', {
        sessionId,
        dataSize: audioData.length
      });

      // Clear any pending audio response before sending new input
      this.clearAllAudioResponses();

      // Record conversation turn
      this.recordTurn('audio', audioData.length);

      // Send audio input to the Live session
      await this.session.sendRealtimeInput({
        media: audioData // This should be a Blob or ArrayBuffer
      });

      logger.info('Audio input sent successfully to Gemini Live', { 
        sessionId,
        turnCount: this.conversationState.turnCount
      });

    } catch (error) {
      logger.error('Failed to send audio input to Gemini Live', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  // Schedule response completion check
  scheduleResponseCompletion() {
    // Clear any existing timeout
    if (this.responseCompletionTimeout) {
      clearTimeout(this.responseCompletionTimeout);
    }
    
    // Set timeout to complete response after 500ms of no new chunks
    this.responseCompletionTimeout = setTimeout(() => {
      this.completeAudioResponse();
    }, 500);
  }
  
  // Complete the current audio response
  async completeAudioResponse() {
    if (this.currentAudioResponse.chunks.length === 0) {
      return;
    }
    
    // Prevent multiple simultaneous audio responses
    if (this.isProcessingAudioResponse) {
      logger.info('Audio response already being processed, queuing this response');
      this.audioResponseQueue.push({
        chunks: [...this.currentAudioResponse.chunks],
        startTime: this.currentAudioResponse.startTime
      });
      this.clearCurrentAudioResponse();
      return;
    }
    
    this.isProcessingAudioResponse = true;
    
    logger.info('Completing audio response', {
      totalChunks: this.currentAudioResponse.chunks.length,
      duration: Date.now() - this.currentAudioResponse.startTime,
      queueLength: this.audioResponseQueue.length
    });
    
    // Combine all chunks into one complete response
    const completeAudio = this.combineAudioChunks(this.currentAudioResponse.chunks);
    
    // Add to audio queue for streaming
    this.audioQueue.push(completeAudio);
    
    // Update conversation turn with response length
    if (this.conversationState.isActive && this.conversationState.conversationHistory.length > 0) {
      const lastTurn = this.conversationState.conversationHistory[this.conversationState.conversationHistory.length - 1];
      lastTurn.responseLength = completeAudio.length;
    }
    
    // Emit the complete audio response
    if (this.onAudioChunk) {
      await this.onAudioChunk(completeAudio);
    }
    
    // Reset for next response
    this.clearCurrentAudioResponse();
    
    // Process next queued response if any
    this.isProcessingAudioResponse = false;
    if (this.audioResponseQueue.length > 0) {
      const nextResponse = this.audioResponseQueue.shift();
      this.currentAudioResponse = {
        chunks: nextResponse.chunks,
        isComplete: false,
        startTime: nextResponse.startTime
      };
      // Process the next response immediately
      setTimeout(() => this.completeAudioResponse(), 100);
    }
  }
  
  // Clear current audio response buffer
  clearCurrentAudioResponse() {
    this.currentAudioResponse = {
      chunks: [],
      isComplete: false,
      startTime: null
    };
    
    if (this.responseCompletionTimeout) {
      clearTimeout(this.responseCompletionTimeout);
      this.responseCompletionTimeout = null;
    }
    
    logger.info('Current audio response cleared');
  }
  
  // Clear all audio responses (for interruptions)
  clearAllAudioResponses() {
    this.clearCurrentAudioResponse();
    this.audioResponseQueue = [];
    this.isProcessingAudioResponse = false;
    logger.info('All audio responses cleared');
  }
  
  // Start a new conversation
  startConversation(sessionId, voiceName = null) {
    this.conversationState = {
      isActive: true,
      startTime: Date.now(),
      turnCount: 0,
      lastActivity: Date.now(),
      conversationHistory: [],
      sessionId,
      voiceName: voiceName || this.conversationState.voiceName,
      speechRate: this.conversationState.speechRate,
      isInterrupted: false
    };
    
    logger.info('Conversation started', {
      sessionId,
      voiceName: this.conversationState.voiceName,
      startTime: new Date(this.conversationState.startTime).toISOString()
    });
  }
  
  // End the current conversation
  endConversation() {
    const duration = Date.now() - this.conversationState.startTime;
    const turnCount = this.conversationState.turnCount;
    
    logger.info('Conversation ended', {
      sessionId: this.conversationState.sessionId,
      duration: Math.round(duration / 1000) + 's',
      turnCount,
      voiceName: this.conversationState.voiceName
    });
    
    this.conversationState = {
      isActive: false,
      startTime: null,
      turnCount: 0,
      lastActivity: null,
      conversationHistory: [],
      sessionId: null,
      voiceName: this.conversationState.voiceName,
      speechRate: this.conversationState.speechRate,
      isInterrupted: false
    };
  }
  
  // Record a conversation turn
  recordTurn(inputType, inputLength, responseLength = 0) {
    if (!this.conversationState.isActive) {
      logger.warn('Attempted to record turn in inactive conversation');
      return;
    }
    
    this.conversationState.turnCount++;
    this.conversationState.lastActivity = Date.now();
    
    this.conversationState.conversationHistory.push({
      turn: this.conversationState.turnCount,
      timestamp: Date.now(),
      inputType, // 'text' or 'audio'
      inputLength,
      responseLength,
      duration: Date.now() - this.conversationState.startTime
    });
    
    logger.info('Conversation turn recorded', {
      turn: this.conversationState.turnCount,
      inputType,
      inputLength,
      responseLength,
      sessionId: this.conversationState.sessionId
    });
  }
  
  // Check if conversation is still active
  isConversationActive() {
    if (!this.conversationState.isActive) return false;
    
    const timeSinceLastActivity = Date.now() - this.conversationState.lastActivity;
    const maxInactivity = 10 * 60 * 1000; // 10 minutes
    
    if (timeSinceLastActivity > maxInactivity) {
      logger.info('Conversation timed out due to inactivity', {
        sessionId: this.conversationState.sessionId,
        timeSinceLastActivity: Math.round(timeSinceLastActivity / 1000) + 's'
      });
      this.endConversation();
      return false;
    }
    
    return true;
  }
  
  // Get conversation statistics
  getConversationStats() {
    if (!this.conversationState.isActive) {
      return { isActive: false };
    }
    
    const duration = Date.now() - this.conversationState.startTime;
    const avgTurnTime = this.conversationState.turnCount > 0 
      ? duration / this.conversationState.turnCount 
      : 0;
    
    return {
      isActive: true,
      sessionId: this.conversationState.sessionId,
      duration: Math.round(duration / 1000),
      turnCount: this.conversationState.turnCount,
      avgTurnTime: Math.round(avgTurnTime / 1000),
      voiceName: this.conversationState.voiceName,
      speechRate: this.conversationState.speechRate,
      lastActivity: new Date(this.conversationState.lastActivity).toISOString()
    };
  }
  
  // Start session monitoring for continuous conversations
  startSessionMonitoring() {
    if (this.sessionMonitorInterval) {
      clearInterval(this.sessionMonitorInterval);
    }
    
    this.sessionMonitorInterval = setInterval(() => {
      this.monitorSession();
    }, 30000); // Check every 30 seconds
    
    logger.info('Session monitoring started for continuous conversations');
  }
  
  // Monitor session health and conversation state
  monitorSession() {
    // Check conversation activity
    if (this.conversationState.isActive && !this.isConversationActive()) {
      logger.info('Conversation timed out, ending session');
      this.endConversation();
      return;
    }
    
    // Check session duration
    if (this.session && this.isConnected) {
      const sessionDuration = Date.now() - this.quotaManager.lastSessionTime;
      if (sessionDuration > this.sessionManager.maxSessionDuration) {
        logger.info('Session duration exceeded, refreshing session');
        this.refreshSession();
      }
    }
    
    // Log session health
    logger.info('Session health check', {
      isConnected: this.isConnected,
      conversationActive: this.conversationState.isActive,
      sessionDuration: this.session ? Math.round((Date.now() - this.quotaManager.lastSessionTime) / 1000) : 0,
      reconnectAttempts: this.sessionManager.reconnectAttempts
    });
  }
  
  // Attempt to reconnect for continuous conversations
  async attemptReconnection() {
    const now = Date.now();
    const timeSinceLastReconnect = now - this.sessionManager.lastReconnectTime;
    const minReconnectInterval = 5000; // 5 seconds
    
    if (this.sessionManager.reconnectAttempts >= this.sessionManager.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached', {
        attempts: this.sessionManager.reconnectAttempts,
        sessionId: this.conversationState.sessionId
      });
      this.endConversation();
      return;
    }
    
    if (timeSinceLastReconnect < minReconnectInterval) {
      logger.info('Reconnection attempt too soon, waiting', {
        timeSinceLastReconnect: Math.round(timeSinceLastReconnect / 1000) + 's'
      });
      return;
    }
    
    this.sessionManager.reconnectAttempts++;
    this.sessionManager.lastReconnectTime = now;
    
    logger.info('Attempting to reconnect for continuous conversation', {
      attempt: this.sessionManager.reconnectAttempts,
      sessionId: this.conversationState.sessionId
    });
    
    try {
      await this.reconnect();
      logger.info('Reconnection successful');
    } catch (error) {
      logger.error('Reconnection failed', { error: error.message });
      
      // Schedule next attempt
      setTimeout(() => {
        if (this.conversationState.isActive) {
          this.attemptReconnection();
        }
      }, 10000); // Wait 10 seconds before next attempt
    }
  }
  
  // Refresh session for long conversations
  async refreshSession() {
    if (!this.conversationState.isActive) {
      logger.info('No active conversation, skipping session refresh');
      return;
    }
    
    logger.info('Refreshing session for continuous conversation', {
      sessionId: this.conversationState.sessionId,
      turnCount: this.conversationState.turnCount
    });
    
    try {
      // Close current session
      if (this.session) {
        await this.session.close();
      }
      
      // Initialize new session with same voice
      await this.initSession(this.conversationState.voiceName);
      
      logger.info('Session refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh session', { error: error.message });
      this.endConversation();
    }
  }
  
  // Combine multiple audio chunks into one
  combineAudioChunks(chunks) {
    if (chunks.length === 0) return null;
    if (chunks.length === 1) return chunks[0];
    
    // For WAV files, we need to combine the data sections while preserving the header
    const firstChunk = Buffer.from(chunks[0], 'base64');
    const isWAV = firstChunk.length >= 12 && 
                 firstChunk.slice(0, 4).toString() === 'RIFF' &&
                 firstChunk.slice(8, 12).toString() === 'WAVE';
    
    if (isWAV) {
      // For WAV files, combine the data sections while preserving the header
      const header = firstChunk.slice(0, 44); // WAV header
      const dataChunks = chunks.map(chunk => {
        const buffer = Buffer.from(chunk, 'base64');
        return buffer.slice(44); // Skip header for all chunks except first
      });
      
      const combinedData = Buffer.concat(dataChunks);
      const totalSize = 36 + combinedData.length; // 36 + data size
      
      // Update WAV header with new size
      const newHeader = Buffer.alloc(44);
      header.copy(newHeader, 0, 0, 4); // RIFF
      newHeader.writeUInt32LE(totalSize, 4); // File size
      header.copy(newHeader, 8, 8, 44); // Rest of header
      newHeader.writeUInt32LE(combinedData.length, 40); // Update data chunk size
      
      const combinedWAV = Buffer.concat([newHeader, combinedData]);
      return combinedWAV.toString('base64');
    } else {
      // For raw audio, just concatenate
      const buffers = chunks.map(chunk => Buffer.from(chunk, 'base64'));
      const combined = Buffer.concat(buffers);
      return combined.toString('base64');
    }
  }

  // Clear audio queue
  clearAudioQueue() {
    this.audioQueue = [];
    logger.info('Audio queue cleared');
  }

  // Get next audio chunk from queue
  getNextAudioChunk() {
    return this.audioQueue.shift();
  }

  // Check if there are more audio chunks
  hasMoreAudio() {
    return this.audioQueue.length > 0;
  }

  // Close the Live session
  async closeSession() {
    try {
      // End conversation if active
      if (this.conversationState.isActive) {
        this.endConversation();
      }
      
      // Stop session monitoring
      if (this.sessionMonitorInterval) {
        clearInterval(this.sessionMonitorInterval);
        this.sessionMonitorInterval = null;
      }
      
      if (this.session) {
        await this.session.close();
        this.session = null;
        this.isConnected = false;
        logger.info('Gemini Live session closed successfully');
      }
    } catch (error) {
      logger.error('Failed to close Gemini Live session', { error: error.message });
    }
  }

  // Switch voice and reconnect
  async switchVoice(voiceName) {
    try {
      logger.info('Switching voice', { newVoice: voiceName });
      
      await this.closeSession();
      await this.initSession(voiceName);
      logger.info('Voice switched successfully', { voice: voiceName });
    } catch (error) {
      logger.error('Failed to switch voice', { error: error.message });
      throw error;
    }
  }

  // Set speech rate (0.3 = 30% speed, 1.0 = normal, 1.5 = 150% speed)
  async setSpeechRate(rate) {
    try {
      logger.info('Setting speech rate', { rate });
      
      // Close current session and reconnect with new speech rate
      await this.closeSession();
      
      // Store the speech rate for the next session
      this.speechRate = Math.max(0.3, Math.min(2.0, rate)); // Clamp between 0.3 and 2.0
      
      await this.initSession();
      logger.info('Speech rate updated successfully', { rate: this.speechRate });
    } catch (error) {
      logger.error('Failed to set speech rate', { error: error.message });
      throw error;
    }
  }

  // Set ultra-slow speech rate for maximum clarity
  async setUltraSlowSpeech() {
    try {
      logger.info('Setting ultra-slow speech rate');
      await this.setSpeechRate(0.3); // 30% speed - very slow
      logger.info('Ultra-slow speech rate set successfully');
    } catch (error) {
      logger.error('Failed to set ultra-slow speech rate', { error: error.message });
      throw error;
    }
  }

  // Get available voices
  getAvailableVoices() {
    return [
      { name: 'Orus', description: 'Male voice - Clear and natural' },
      { name: 'Kore', description: 'Female voice - Warm and friendly' },
      { name: 'Aria', description: 'Female voice - Professional' },
      { name: 'Echo', description: 'Male voice - Deep and authoritative' }
    ];
  }

  // Reconnect the session
  async reconnect() {
    try {
      await this.closeSession();
      await this.initSession();
      logger.info('Gemini Live session reconnected');
    } catch (error) {
      logger.error('Failed to reconnect Gemini Live session', { error: error.message });
      throw error;
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

Remember: Always respond naturally and helpfully. If someone asks you to say something specific, do it and then offer to help them with Revolt Motors information!`;
  }

  // Set callback functions
  setCallbacks(callbacks) {
    this.onAudioChunk = callbacks.onAudioChunk;
    this.onTextResponse = callbacks.onTextResponse;
    this.onInterruption = callbacks.onInterruption;
  }

  // Validate configuration
  async validateConfiguration() {
    try {
      if (!this.client) {
        return { isValid: false, error: 'Client not initialized' };
      }

      if (!this.isConnected) {
        return { isValid: false, error: 'Session not connected' };
      }

      return {
        isValid: true,
        model: 'gemini-2.0-flash-live-001',
        voice: config.tts?.voice || 'Orus',
        isConnected: this.isConnected
      };
    } catch (error) {
      logger.error('Failed to validate Gemini Live configuration', { error: error.message });
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  // Get service status
  getStatus() {
    const currentKey = this.currentApiKeyIndex;
    const usage = this.quotaManager.keyUsage.get(currentKey);
    
    return {
      isConnected: this.isConnected,
      model: 'gemini-2.0-flash-live-001',
      voice: config.tts?.voice || 'Orus',
      audioQueueLength: this.audioQueue.length,
      isProcessing: this.isProcessing,
      serviceType: 'Gemini Live API',
      conversation: this.getConversationStats(),
      session: {
        isConnected: this.isConnected,
        reconnectAttempts: this.sessionManager.reconnectAttempts,
        maxReconnectAttempts: this.sessionManager.maxReconnectAttempts,
        autoReconnect: this.sessionManager.autoReconnect,
        sessionDuration: this.session ? Math.round((Date.now() - this.quotaManager.lastSessionTime) / 1000) : 0,
        maxSessionDuration: Math.round(this.sessionManager.maxSessionDuration / 1000)
      },
      quota: {
        currentKey: currentKey + 1,
        totalKeys: this.apiKeys.length,
        minuteUsage: usage ? usage.minuteCount : 0,
        hourUsage: usage ? usage.hourCount : 0,
        minuteLimit: this.quotaManager.requestsPerMinute,
        hourLimit: this.quotaManager.requestsPerHour,
        sessionReusable: this.canReuseSession()
      }
    };
  }
}

module.exports = GeminiLiveService; 