const GeminiService = require('../../services/GeminiService');
const sessionManager = require('../../services/SessionManager');
const logger = require('../../utils/logger');

// Handler for voice chat WebSocket events
class VoiceHandler {
  constructor() {
    this.geminiService = new GeminiService();
    this.activeStreams = new Map(); // sessionId -> stream info
  }

  // Initialize voice chat handlers for a socket
  setupHandlers(socket) {
    // Start conversation
    socket.on('start-conversation', async (data) => {
      await this.handleStartConversation(socket, data);
    });

    // Receive audio chunk from client
    socket.on('audio-chunk', async (data) => {
      await this.handleAudioChunk(socket, data);
    });

    // User stopped speaking
    socket.on('stop-speaking', async (data) => {
      await this.handleStopSpeaking(socket, data);
    });

    // User interrupts AI
    socket.on('interrupt', async (data) => {
      await this.handleInterruption(socket, data);
    });

    // End conversation
    socket.on('end-conversation', async (data) => {
      await this.handleEndConversation(socket, data);
    });
  }

  // Handle start conversation event
  async handleStartConversation(socket, data) {
    try {
      logger.logWebSocketEvent('start-conversation', socket.id, data);

      // Safely get userId from multiple sources
      const userId = data?.userId || socket.handshake?.auth?.userId || socket.userId || 'guest-user';

      // Create new session
      const session = sessionManager.createSession(socket.id, userId);
      
      // Create Gemini chat session
      const geminiChat = await this.geminiService.createChatSession(session.id);
      session.geminiSession = geminiChat;
      session.updateStatus('active');

      // Store stream info
      this.activeStreams.set(session.id, {
        geminiChat,
        isProcessing: false,
        audioQueue: []
      });

      // Send session info to client
      socket.emit('session-status', {
        sessionId: session.id,
        status: 'active',
        message: 'Voice chat session started'
      });

      logger.info('Session started successfully', {
        sessionId: session.id,
        socketId: socket.id,
        userId: userId
      });

    } catch (error) {
      logger.error('Failed to start conversation', { 
        socketId: socket.id, 
        error: error.message 
      });
      
      socket.emit('error', {
        type: 'start-conversation-error',
        message: 'Failed to start voice chat session',
        details: error.message
      });
    }
  }

  // Handle incoming audio chunk
  async handleAudioChunk(socket, data) {
    try {
      const session = sessionManager.getSessionBySocketId(socket.id);
      if (!session) {
        socket.emit('error', {
          type: 'no-session',
          message: 'No active session found'
        });
        return;
      }

      logger.logAudioEvent('chunk-received', session.id, { 
        size: data.audio?.length || 0 
      });

      // Add to session's audio buffer
      session.addAudioChunk(data.audio);
      
      // Queue for processing
      const streamInfo = this.activeStreams.get(session.id);
      if (streamInfo) {
        streamInfo.audioQueue.push(data.audio);
      }

    } catch (error) {
      logger.error('Failed to handle audio chunk', { 
        socketId: socket.id, 
        error: error.message 
      });
      
      socket.emit('error', {
        type: 'audio-chunk-error',
        message: 'Failed to process audio chunk'
      });
    }
  }

  // Handle stop speaking event
  async handleStopSpeaking(socket, data) {
    try {
      const session = sessionManager.getSessionBySocketId(socket.id);
      if (!session) {
        socket.emit('error', {
          type: 'no-session',
          message: 'No active session found'
        });
        return;
      }

      logger.logWebSocketEvent('stop-speaking', socket.id, { sessionId: session.id });

      const streamInfo = this.activeStreams.get(session.id);
      if (!streamInfo) {
        logger.error('No stream info found for session', { sessionId: session.id });
        socket.emit('error', {
          type: 'no-stream',
          message: 'No active stream found'
        });
        return;
      }
      
      if (streamInfo.isProcessing) {
        logger.info('Stream already processing, skipping', { sessionId: session.id });
        return;
      }

      streamInfo.isProcessing = true;

      // Add timeout to prevent stuck processing flag
      const processingTimeout = setTimeout(() => {
        if (streamInfo.isProcessing) {
          logger.warn('Processing timeout, resetting flag', { sessionId: session.id });
          streamInfo.isProcessing = false;
        }
      }, 30000); // 30 second timeout

      // Get the actual transcription from the frontend
      const actualTranscription = data.transcription || 'I heard you speak';
      
      // Process accumulated audio
      const audioData = Buffer.concat(streamInfo.audioQueue.map(chunk => 
        Buffer.from(chunk, 'base64')
      ));

      // Clear queue
      streamInfo.audioQueue = [];
      session.clearAudioBuffer();

      // Send immediate feedback that we're processing
      socket.emit('ai-thinking', {
        message: 'Processing your request...',
        timestamp: new Date().toISOString()
      });
      
      logger.info('Sent ai-thinking event', { sessionId: session.id });

      // Start typing indicator
      socket.emit('ai-typing', {
        status: 'started',
        timestamp: new Date().toISOString()
      });
      
      let response;
      try {
        // Use the actual transcription instead of simulated audio processing
        response = await this.geminiService.processTextInput(
          null, // No chat session needed
          actualTranscription,
          session.id
        );
      } catch (error) {
        logger.error('Gemini API error, using fallback response', { 
          sessionId: session.id, 
          error: error.message,
          errorStack: error.stack,
          actualTranscription
        });
        
        // Create fallback response when Gemini is overloaded
        response = {
          transcription: actualTranscription,
          text: 'Hi! I\'m Sova, your Revolt Motors assistant. I\'m here to help you with information about our electric motorcycles. How can I assist you today?',
          audio: await this.geminiService.simulateTextToSpeech('Hi! I\'m Sova, your Revolt Motors assistant. I\'m here to help you with information about our electric motorcycles. How can I assist you today?'),
          metadata: {
            processingTime: new Date().toISOString(),
            language: 'en',
            fallback: true
          }
        };
      }

      // Update session history
      session.addToHistory('user', actualTranscription);
      session.addToHistory('assistant', response.text);

      // Stop typing indicator
      socket.emit('ai-typing', {
        status: 'stopped',
        timestamp: new Date().toISOString()
      });

      // Send transcription feedback immediately
      socket.emit('transcription', {
        text: response.transcription,
        timestamp: new Date().toISOString()
      });
      
      logger.info('Sent transcription event', { 
        sessionId: session.id, 
        transcription: response.transcription 
      });

      // Send text response immediately for real-time feedback
      socket.emit('ai-response-text', {
        text: response.text,
        timestamp: new Date().toISOString(),
        metadata: response.metadata
      });
      
      logger.info('Sent ai-response-text event', { 
        sessionId: session.id, 
        responseLength: response.text.length 
      });

      // Send response back to client
      await this.streamAudioResponse(socket, session.id, response);

      clearTimeout(processingTimeout);
      streamInfo.isProcessing = false;
    } catch (error) {
      logger.error('Failed to handle stop speaking', { 
        socketId: socket.id, 
        error: error.message 
      });
      
      socket.emit('error', {
        type: 'stop-speaking-error',
        message: 'Failed to process speech'
      });
    }
  }

  // Handle interruption
  async handleInterruption(socket, data) {
    try {
      const session = sessionManager.getSessionBySocketId(socket.id);
      if (!session) {
        socket.emit('error', {
          type: 'no-session',
          message: 'No active session found'
        });
        return;
      }

      logger.logWebSocketEvent('interrupt', socket.id, { sessionId: session.id });

      // Record interruption
      session.recordInterruption();

      // Stop any ongoing audio streaming
      const streamInfo = this.activeStreams.get(session.id);
      if (streamInfo) {
        streamInfo.isProcessing = false;
        streamInfo.audioQueue = [];
        await this.geminiService.handleInterruption(streamInfo.geminiChat, session.id);
      }

      // Clear audio buffer
      session.clearAudioBuffer();

      // Notify client
      socket.emit('ai-finished', {
        interrupted: true,
        message: 'AI response interrupted'
      });

    } catch (error) {
      logger.error('Failed to handle interruption', { 
        socketId: socket.id, 
        error: error.message 
      });
      
      socket.emit('error', {
        type: 'interruption-error',
        message: 'Failed to interrupt'
      });
    }
  }

  // Handle end conversation
  async handleEndConversation(socket, data) {
    try {
      const session = sessionManager.getSessionBySocketId(socket.id);
      if (!session) {
        // Session might already be ended
        return;
      }

      logger.logWebSocketEvent('end-conversation', socket.id, { sessionId: session.id });

      // Clean up Gemini session
      if (session.geminiSession) {
        await this.geminiService.endChatSession(session.id);
      }

      // Remove active stream
      this.activeStreams.delete(session.id);

      // End session
      sessionManager.endSession(session.id);

      // Notify client
      socket.emit('session-status', {
        sessionId: session.id,
        status: 'ended',
        message: 'Voice chat session ended',
        summary: session.getSummary()
      });

    } catch (error) {
      logger.error('Failed to end conversation', { 
        socketId: socket.id, 
        error: error.message 
      });
    }
  }

  // Stream audio response to client
  async streamAudioResponse(socket, sessionId, response) {
    try {
      const session = sessionManager.getSession(sessionId);
      if (!session) return;

      session.isAISpeaking = true;

      // Simulate streaming audio chunks
      // In production, this would stream real audio data
      const audioChunks = this.splitAudioIntoChunks(response.audio);
      
      // Stream chunks with delays
      for (let chunkIndex = 0; chunkIndex < audioChunks.length; chunkIndex++) {
        if (!session.isAISpeaking) {
          break;
        }

        socket.emit('audio-response', {
          chunk: audioChunks[chunkIndex],
          index: chunkIndex,
          total: audioChunks.length
        });

        // Log audio streaming progress
        if (chunkIndex % 10 === 0 || chunkIndex === audioChunks.length - 1) {
          logger.info('Audio streaming progress', {
            sessionId,
            chunkIndex,
            totalChunks: audioChunks.length,
            progress: `${Math.round((chunkIndex / audioChunks.length) * 100)}%`
          });
        }

        // Small delay between chunks
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Mark AI as finished speaking
      session.isAISpeaking = false;
      socket.emit('ai-finished', {
        text: response.text,
        metadata: response.metadata
      });

    } catch (error) {
      logger.error('Failed to stream audio response', { 
        sessionId, 
        error: error.message 
      });
    }
  }

  // Split audio into chunks for streaming
  splitAudioIntoChunks(audioData, chunkSize = 1024) {
    const chunks = [];
    
    // Handle null or undefined audio data
    if (!audioData) {
      logger.warn('No audio data provided, generating fallback audio', { chunkSize });
      // Generate a simple beep sound as fallback
      const fallbackAudio = this.generateFallbackAudio();
      return this.splitAudioIntoChunks(fallbackAudio, chunkSize);
    }
    
    try {
      // Convert base64 string to Buffer if needed
      let audioBuffer;
      if (typeof audioData === 'string') {
        // It's a base64 string, decode it
        audioBuffer = Buffer.from(audioData, 'base64');
        logger.info('Decoded base64 audio data', { 
          originalLength: audioData.length,
          decodedLength: audioBuffer.length 
        });
      } else if (Buffer.isBuffer(audioData)) {
        // It's already a Buffer
        audioBuffer = audioData;
      } else {
        // Unknown format, generate fallback
        logger.warn('Unknown audio data format, generating fallback', { 
          type: typeof audioData,
          length: audioData?.length 
        });
        const fallbackAudio = this.generateFallbackAudio();
        return this.splitAudioIntoChunks(fallbackAudio, chunkSize);
      }
      
      // Check if this is a WAV file (has RIFF header)
      const isWAV = audioBuffer.length >= 12 && 
                   audioBuffer[0] === 0x52 && audioBuffer[1] === 0x49 && 
                   audioBuffer[2] === 0x46 && audioBuffer[3] === 0x46 &&
                   audioBuffer[8] === 0x57 && audioBuffer[9] === 0x41 && 
                   audioBuffer[10] === 0x56 && audioBuffer[11] === 0x45;
      
      if (isWAV) {
        logger.info('Detected WAV format, sending as single chunk to preserve headers');
        // For WAV files, send the entire file as one chunk to preserve headers
        chunks.push(audioBuffer.toString('base64'));
      } else {
        // For non-WAV files, split into chunks as before
        for (let i = 0; i < audioBuffer.length; i += chunkSize) {
          const chunk = audioBuffer.slice(i, i + chunkSize);
          // Convert chunk back to base64 for transmission
          chunks.push(chunk.toString('base64'));
        }
      }
      
      logger.info('Audio split into chunks', { 
        totalChunks: chunks.length,
        chunkSize: chunkSize,
        totalAudioSize: audioBuffer.length 
      });
      
      return chunks;
      
    } catch (error) {
      logger.error('Failed to split audio into chunks', { 
        error: error.message,
        audioDataType: typeof audioData,
        audioDataLength: audioData?.length 
      });
      
      // Generate fallback audio
      const fallbackAudio = this.generateFallbackAudio();
      return this.splitAudioIntoChunks(fallbackAudio, chunkSize);
    }
  }

  // Generate fallback audio when TTS fails
  generateFallbackAudio() {
    // Generate a simple beep sound
    const sampleRate = 16000;
    const duration = 0.5; // 500ms beep
    const samples = Math.floor(sampleRate * duration);
    
    const audioBuffer = new ArrayBuffer(samples * 2); // 16-bit samples
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
    
    return Buffer.from(audioBuffer);
  }

  // Clean up handler resources
  cleanup() {
    this.activeStreams.clear();
  }
}

module.exports = VoiceHandler; 