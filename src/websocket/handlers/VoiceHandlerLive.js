const GeminiLiveService = require('../../services/GeminiLiveService');
const sessionManager = require('../../services/SessionManager');
const logger = require('../../utils/logger');

// Handler for voice chat WebSocket events using Gemini Live API
class VoiceHandlerLive {
  constructor() {
    this.geminiLiveService = new GeminiLiveService();
    this.activeSessions = new Map(); // sessionId -> session info
    this.audioBuffers = new Map(); // Buffer audio chunks for longer segments
    this.bufferThreshold = 1.5; // Buffer until we have 1.5 seconds of audio (much longer segments)
    this.setupCallbacks();
  }

  // Setup callbacks for the Gemini Live service
  setupCallbacks() {
    this.geminiLiveService.setCallbacks({
      onAudioChunk: (audioData) => {
        this.handleAudioChunkFromGemini(audioData);
      },
      onTextResponse: (text) => {
        this.handleTextResponseFromGemini(text);
      },
      onInterruption: () => {
        this.handleInterruptionFromGemini();
      }
    });
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

    // Handle text input (for testing)
    socket.on('text-input', async (data) => {
      await this.handleTextInput(socket, data);
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
      
      // Store session info with socket reference
      this.activeSessions.set(session.id, {
        session,
        socket,
        isProcessing: false,
        audioQueue: []
      });

      // Update session status
      session.updateStatus('active');

      // Send session info to client
      socket.emit('session-status', {
        sessionId: session.id,
        status: 'active',
        message: 'Voice chat session started with Gemini Live'
      });

      logger.info('Gemini Live session started successfully', {
        sessionId: session.id,
        socketId: socket.id,
        userId: userId
      });

    } catch (error) {
      logger.error('Failed to start Gemini Live conversation', { 
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

  // Handle incoming audio chunk from client
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

      const sessionInfo = this.activeSessions.get(session.id);
      if (!sessionInfo) {
        logger.error('Session info not found', { sessionId: session.id });
        return;
      }

      // Check if we're already processing
      if (sessionInfo.isProcessing) {
        logger.debug('Already processing audio, skipping chunk', { sessionId: session.id });
        return;
      }

      const { audioData, chunkIndex, isLastChunk } = data;

      logger.debug('Received audio chunk', {
        sessionId: session.id,
        chunkIndex,
        isLastChunk,
        dataSize: audioData?.length || 0
      });

      // Store audio chunk for processing
      if (!sessionInfo.audioQueue) {
        sessionInfo.audioQueue = [];
      }
      sessionInfo.audioQueue.push({
        data: audioData,
        index: chunkIndex,
        isLast: isLastChunk
      });

      // If this is the last chunk, process the complete audio
      if (isLastChunk) {
        await this.processCompleteAudio(session.id);
      }

    } catch (error) {
      logger.error('Failed to handle audio chunk', {
        sessionId: session?.id,
        socketId: socket.id,
        error: error.message
      });
    }
  }

  // Process complete audio input
  async processCompleteAudio(sessionId) {
    try {
      const sessionInfo = this.activeSessions.get(sessionId);
      if (!sessionInfo) {
        logger.error('Session info not found for audio processing', { sessionId });
        return;
      }

      sessionInfo.isProcessing = true;

      logger.info('Processing complete audio input', { sessionId });

      // Combine all audio chunks
      const audioChunks = sessionInfo.audioQueue.sort((a, b) => a.index - b.index);
      const combinedAudio = audioChunks.map(chunk => chunk.data).join('');

      // Clear the queue
      sessionInfo.audioQueue = [];

      // Send audio to Gemini Live
      await this.geminiLiveService.sendAudioInput(combinedAudio, sessionId);

      logger.info('Audio sent to Gemini Live successfully', { sessionId });

    } catch (error) {
      logger.error('Failed to process complete audio', {
        sessionId,
        error: error.message
      });

      // Reset processing flag
      const sessionInfo = this.activeSessions.get(sessionId);
      if (sessionInfo) {
        sessionInfo.isProcessing = false;
      }
    }
  }

  // Handle text input (for testing without audio)
  async handleTextInput(socket, data) {
    let session = null;
    try {
      session = sessionManager.getSessionBySocketId(socket.id);
      if (!session) {
        socket.emit('error', {
          type: 'no-session',
          message: 'No active session found'
        });
        return;
      }

      const { text } = data;
      
      if (!text || text.trim().length === 0) {
        socket.emit('error', {
          type: 'invalid-input',
          message: 'No text provided'
        });
        return;
      }

      logger.info('Processing text input', {
        sessionId: session.id,
        textLength: text.length,
        text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
      });

      // Send text to Gemini Live
      await this.geminiLiveService.sendTextInput(text, session.id);

      logger.info('Text sent to Gemini Live successfully', { sessionId: session.id });

    } catch (error) {
      logger.error('Failed to handle text input', {
        sessionId: session?.id,
        socketId: socket.id,
        error: error.message
      });

      socket.emit('error', {
        type: 'text-input-error',
        message: 'Failed to process text input',
        details: error.message
      });
    }
  }

  // Handle audio chunk from Gemini Live with buffering for longer segments
  async handleAudioChunkFromGemini(audioData) {
    try {
      // Find the session that should receive this audio
      // For now, we'll send to all active sessions
      for (const [sessionId, sessionInfo] of this.activeSessions) {
        const { socket } = sessionInfo;
        
        if (socket && socket.connected) {
          // Initialize buffer for this session if it doesn't exist
          if (!this.audioBuffers.has(sessionId)) {
            this.audioBuffers.set(sessionId, {
              chunks: [],
              totalDuration: 0,
              lastSentTime: Date.now()
            });
          }
          
          const buffer = this.audioBuffers.get(sessionId);
          
          // Add this audio chunk to the buffer
          buffer.chunks.push(audioData);
          
          // Estimate duration (rough calculation: 1 second ≈ 44100 samples * 2 bytes)
          const estimatedDuration = this.estimateAudioDuration(audioData);
          buffer.totalDuration += estimatedDuration;
          
          logger.info('Buffering audio chunk', {
            sessionId,
            chunkDuration: estimatedDuration,
            totalBufferedDuration: buffer.totalDuration,
            bufferThreshold: this.bufferThreshold,
            chunksInBuffer: buffer.chunks.length
          });
          
          // Check if we have enough audio to send a longer segment
          if (buffer.totalDuration >= this.bufferThreshold || 
              (Date.now() - buffer.lastSentTime) > 2000) { // Force send after 2 seconds
            
            // Combine all buffered chunks into one longer audio segment
            const combinedAudio = this.combineAudioChunks(buffer.chunks);
            
            // Split the combined audio into larger chunks for streaming
            const chunks = this.splitAudioIntoChunks(combinedAudio, 8192); // Larger chunk size
            
            logger.info('Sending buffered audio segment', {
              sessionId,
              totalChunks: chunks.length,
              chunkSize: chunks[0]?.length || 0,
              totalDuration: buffer.totalDuration,
              segmentsInBuffer: buffer.chunks.length
            });

            // Stream chunks to client
            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i];
              const isLastChunk = i === chunks.length - 1;
              
              socket.emit('audio-chunk', {
                sessionId,
                chunkIndex: i,
                totalChunks: chunks.length,
                isLastChunk,
                audioData: chunk,
                progress: Math.round(((i + 1) / chunks.length) * 100) + '%'
              });

              // Small delay between chunks for smooth streaming
              await new Promise(resolve => setTimeout(resolve, 20));
            }

            // Send completion signal
            socket.emit('audio-complete', {
              sessionId,
              totalChunks: chunks.length
            });
            
            // Reset buffer
            buffer.chunks = [];
            buffer.totalDuration = 0;
            buffer.lastSentTime = Date.now();
          }
        }
      }
    } catch (error) {
      logger.error('Failed to handle audio chunk from Gemini', { error: error.message });
    }
  }

  // Handle text response from Gemini Live
  async handleTextResponseFromGemini(text) {
    try {
      logger.info('Received text response from Gemini Live', {
        textLength: text.length,
        text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
      });

      // Send text response to all active sessions
      for (const [sessionId, sessionInfo] of this.activeSessions) {
        const { socket } = sessionInfo;
        
        if (socket && socket.connected) {
          socket.emit('text-response', {
            sessionId,
            text,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      logger.error('Failed to handle text response from Gemini', { error: error.message });
    }
  }

  // Handle interruption from Gemini Live
  async handleInterruptionFromGemini() {
    try {
      logger.info('Handling interruption from Gemini Live');

      // Notify all active sessions about the interruption
      for (const [sessionId, sessionInfo] of this.activeSessions) {
        const { socket } = sessionInfo;
        
        if (socket && socket.connected) {
          socket.emit('interruption', {
            sessionId,
            message: 'Audio response interrupted',
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      logger.error('Failed to handle interruption from Gemini', { error: error.message });
    }
  }

  // Handle user stopped speaking
  async handleStopSpeaking(socket, data) {
    let session = null;
    try {
      session = sessionManager.getSessionBySocketId(socket.id);
      if (!session) {
        return;
      }

      logger.logWebSocketEvent('stop-speaking', socket.id, data);

      // Check if we have a transcription (text) instead of audio
      const { transcription } = data;
      
      if (transcription && transcription.trim().length > 0) {
        // Handle text transcription
        logger.info('Processing text transcription', {
          sessionId: session.id,
          transcription: transcription.substring(0, 100) + (transcription.length > 100 ? '...' : ''),
          transcriptionLength: transcription.length
        });

        // Send text to Gemini Live
        await this.geminiLiveService.sendTextInput(transcription, session.id);
        
        logger.info('Text transcription sent to Gemini Live successfully', { sessionId: session.id });
      } else {
        // Process any remaining audio chunks (if any)
        const sessionInfo = this.activeSessions.get(session.id);
        if (sessionInfo && sessionInfo.audioQueue.length > 0) {
          await this.processCompleteAudio(session.id);
        }
      }

      logger.info('User stopped speaking', { sessionId: session.id });

    } catch (error) {
      logger.error('Failed to handle stop speaking', {
        sessionId: session?.id,
        socketId: socket.id,
        error: error.message
      });
    }
  }

  // Handle user interruption
  async handleInterruption(socket, data) {
    try {
      const session = sessionManager.getSessionBySocketId(socket.id);
      if (!session) {
        return;
      }

      logger.logWebSocketEvent('interrupt', socket.id, data);

      // Clear any pending audio processing
      const sessionInfo = this.activeSessions.get(session.id);
      if (sessionInfo) {
        sessionInfo.isProcessing = false;
        sessionInfo.audioQueue = [];
      }

      // Clear audio queue in Gemini Live service
      this.geminiLiveService.clearAudioQueue();

      logger.info('User interruption handled', { sessionId: session.id });

    } catch (error) {
      logger.error('Failed to handle interruption', {
        sessionId: session?.id,
        socketId: socket.id,
        error: error.message
      });
    }
  }

  // Handle end conversation
  async handleEndConversation(socket, data) {
    try {
      const session = sessionManager.getSessionBySocketId(socket.id);
      if (!session) {
        return;
      }

      logger.logWebSocketEvent('end-conversation', socket.id, data);

      // Flush any remaining buffered audio
      await this.flushAudioBuffer(session.id, socket);

      // Clean up session
      this.activeSessions.delete(session.id);
      this.audioBuffers.delete(session.id);
      sessionManager.endSession(session.id);

      logger.info('Conversation ended', { sessionId: session.id });

    } catch (error) {
      logger.error('Failed to end conversation', {
        sessionId: session?.id,
        socketId: socket.id,
        error: error.message
      });
    }
  }

  // Flush any remaining buffered audio
  async flushAudioBuffer(sessionId, socket) {
    try {
      const buffer = this.audioBuffers.get(sessionId);
      if (buffer && buffer.chunks.length > 0) {
        logger.info('Flushing remaining buffered audio', {
          sessionId,
          chunksInBuffer: buffer.chunks.length,
          totalDuration: buffer.totalDuration
        });
        
        // Combine remaining chunks
        const combinedAudio = this.combineAudioChunks(buffer.chunks);
        const chunks = this.splitAudioIntoChunks(combinedAudio, 8192);
        
        // Send remaining audio
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const isLastChunk = i === chunks.length - 1;
          
          socket.emit('audio-chunk', {
            sessionId,
            chunkIndex: i,
            totalChunks: chunks.length,
            isLastChunk,
            audioData: chunk,
            progress: Math.round(((i + 1) / chunks.length) * 100) + '%'
          });
          
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        
        socket.emit('audio-complete', {
          sessionId,
          totalChunks: chunks.length
        });
      }
    } catch (error) {
      logger.error('Failed to flush audio buffer', { sessionId, error: error.message });
    }
  }

  // Estimate audio duration from base64 data
  estimateAudioDuration(audioData) {
    try {
      const audioBuffer = Buffer.from(audioData, 'base64');
      // For 44.1kHz, 16-bit, mono: 1 second = 44100 * 2 bytes
      const bytesPerSecond = 44100 * 2;
      return audioBuffer.length / bytesPerSecond;
    } catch (error) {
      logger.error('Failed to estimate audio duration', { error: error.message });
      return 0.1; // Default fallback
    }
  }

  // Combine multiple audio chunks into one longer segment
  combineAudioChunks(chunks) {
    try {
      if (chunks.length === 0) return null;
      if (chunks.length === 1) return chunks[0];
      
      // For WAV files, we need to handle headers properly
      const firstChunk = Buffer.from(chunks[0], 'base64');
      const isWAV = firstChunk.length >= 12 && 
                   firstChunk.slice(0, 4).toString() === 'RIFF' &&
                   firstChunk.slice(8, 12).toString() === 'WAVE';
      
      if (isWAV) {
        // For WAV files, combine the data sections while preserving the header
        const header = firstChunk.slice(0, 44); // WAV header is 44 bytes
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
        
        const combinedWAV = Buffer.concat([newHeader, combinedData]);
        return combinedWAV.toString('base64');
      } else {
        // For raw audio, just concatenate
        const buffers = chunks.map(chunk => Buffer.from(chunk, 'base64'));
        const combined = Buffer.concat(buffers);
        return combined.toString('base64');
      }
    } catch (error) {
      logger.error('Failed to combine audio chunks', { error: error.message });
      return chunks[0]; // Fallback to first chunk
    }
  }

  // Split audio into chunks for streaming
  splitAudioIntoChunks(audioData, chunkSize = 1024) {
    try {
      if (!audioData) {
        logger.warn('No audio data provided for chunking');
        return [];
      }

      const audioBuffer = Buffer.from(audioData, 'base64');
      const chunks = [];

      // Check if it's a WAV file (has RIFF header)
      const isWAV = audioBuffer.length >= 12 && 
                   audioBuffer.slice(0, 4).toString() === 'RIFF' &&
                   audioBuffer.slice(8, 12).toString() === 'WAVE';

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
        isWAV: isWAV
      });

      return chunks;
    } catch (error) {
      logger.error('Failed to split audio into chunks', { error: error.message });
      return [];
    }
  }

  // Cleanup resources
  async cleanup() {
    try {
      // Close all active sessions
      for (const [sessionId, sessionInfo] of this.activeSessions) {
        try {
          const { session } = sessionInfo;
          sessionManager.endSession(session.id);
        } catch (error) {
          logger.error('Failed to cleanup session', { sessionId, error: error.message });
        }
      }

      // Clear active sessions and audio buffers
      this.activeSessions.clear();
      this.audioBuffers.clear();

      // Close Gemini Live service
      await this.geminiLiveService.closeSession();

      logger.info('VoiceHandlerLive cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup VoiceHandlerLive', { error: error.message });
    }
  }

  // Get service status
  getStatus() {
    return {
      activeSessions: this.activeSessions.size,
      geminiLiveConnected: this.geminiLiveService.isConnected,
      serviceType: 'Gemini Live API'
    };
  }
}

module.exports = VoiceHandlerLive; 