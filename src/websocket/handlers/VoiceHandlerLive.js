const GeminiLiveService = require('../../services/GeminiLiveService');
const sessionManager = require('../../services/SessionManager');
const logger = require('../../utils/logger');

// Handler for voice chat WebSocket events using Gemini Live API
class VoiceHandlerLive {
  constructor() {
    this.geminiLiveService = new GeminiLiveService();
    this.activeSessions = new Map(); // sessionId -> session info
    // Removed complex buffering - Gemini Live sends complete responses
    
    // CONVERSATION-OPTIMIZED CHUNKING CONFIGURATION
    this.chunkingConfig = {
      // Target chunk duration for natural conversation flow
      targetChunkDuration: 2.0, // 2 seconds per chunk for natural speech
      minChunkDuration: 1.0,    // Minimum 1 second
      maxChunkDuration: 5.0,    // Maximum 5 seconds
      
      // Audio parameters (48kHz, 16-bit, mono)
      sampleRate: 48000,
      channels: 1,
      bitsPerSample: 16,
      bytesPerSecond: 48000 * 1 * 2, // 96,000 bytes/second
      
      // Transmission settings
      sequentialDelay: 50,  // Reduced from 150ms to 50ms
      multiportDelay: 10,   // Keep fast multiport
      maxConcurrentChunks: 12
    };
    
    // Multiport chunking configuration
    this.multiportConfig = {
      enabled: true, // ENABLE EFFICIENT MULTIPORT
      maxPorts: 3, // Match frontend ports (0,1,2)
      chunkDistribution: 'round-robin', // Distribute chunks across ports
      portBase: 3000, // Base port for multiport connections
      chunkDelay: this.chunkingConfig.multiportDelay, // Use optimized delay
      maxConcurrentChunks: this.chunkingConfig.maxConcurrentChunks
    };
    
    // Track multiport connections
    this.multiportConnections = new Map(); // sessionId -> { ports: [], currentPort: 0 }
    
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

      // Check if session already exists for this socket
      let session = sessionManager.getSessionBySocketId(socket.id);
      if (session) {
        logger.info('Session already exists, reusing existing session', {
          sessionId: session.id,
          socketId: socket.id,
          userId: userId
        });
        
        // Update existing session status
        session.updateStatus('active');
        
        // Ensure session is in activeSessions
        if (!this.activeSessions.has(session.id)) {
          this.activeSessions.set(session.id, {
            session,
            socket,
            isProcessing: false,
            audioQueue: []
          });
          logger.info('Added existing session to activeSessions', { sessionId: session.id });
        }
        
        // Send session info to client
        socket.emit('session-status', {
          sessionId: session.id,
          status: 'active',
          message: 'Reusing existing voice chat session',
          multiportEnabled: this.multiportConfig.enabled,
          portCount: this.multiportConfig.maxPorts,
          basePort: this.multiportConfig.portBase
        });
        return;
      }
      
      // Also check if we have an active session for this user
      const existingSession = Array.from(this.activeSessions.values())
        .find(sessionInfo => sessionInfo.socket.id === socket.id);
      
      if (existingSession) {
        logger.info('Active session found for socket, reusing', {
          sessionId: existingSession.session.id,
          socketId: socket.id,
          userId: userId
        });
        
        // Send session info to client
        socket.emit('session-status', {
          sessionId: existingSession.session.id,
          status: 'active',
          message: 'Reusing existing active session',
          multiportEnabled: this.multiportConfig.enabled,
          portCount: this.multiportConfig.maxPorts,
          basePort: this.multiportConfig.portBase
        });
        return;
      }

      // Create new session only if none exists
      session = sessionManager.createSession(socket.id, userId);
      
      // Store session info with socket reference
      this.activeSessions.set(session.id, {
        session,
        socket,
        isProcessing: false,
        audioQueue: []
      });

      // Update session status
      session.updateStatus('active');

      // Start conversation management
      this.geminiLiveService.startConversation(session.id, data?.voiceName);

      // Send session info to client
      socket.emit('session-status', {
        sessionId: session.id,
        status: 'active',
        message: 'Voice chat session started with Gemini Live',
        multiportEnabled: this.multiportConfig.enabled,
        portCount: this.multiportConfig.maxPorts,
        basePort: this.multiportConfig.portBase
      });

      logger.info('Gemini Live session started successfully', {
        sessionId: session.id,
        socketId: socket.id,
        userId: userId,
        conversationActive: this.geminiLiveService.conversationState.isActive
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

  // Handle audio chunk from Gemini Live
  async handleAudioChunkFromGemini(audioData) {
    try {
      // Gemini Live sends complete audio responses, not streaming chunks
      // So we'll send each complete response as properly chunked audio
      
      if (this.activeSessions.size === 0) {
        logger.warn('No active sessions found for audio response');
        return;
      }
      
      for (const [sessionId, sessionInfo] of this.activeSessions) {
        const { socket } = sessionInfo;
        
        if (!socket) {
          logger.warn('No socket found for session', { sessionId });
          continue;
        }
        
        if (!socket.connected) {
          logger.warn('Socket not connected for session', { sessionId });
          continue;
        }
        
        logger.info('Received complete audio response from Gemini Live', {
          sessionId,
          audioDataSize: audioData.length,
          activeSessionsCount: this.activeSessions.size
        });
          
        // Calculate optimal chunk size for this audio response
        const optimalChunkSize = this.calculateOptimalChunkSize(audioData);
        
        // Split the complete audio response into chunks of optimal size
        const chunks = this.splitAudioIntoChunks(audioData, optimalChunkSize);
        
        logger.info('Streaming audio response to client', {
          sessionId,
          totalChunks: chunks.length,
          averageChunkSize: Math.round(audioData.length / chunks.length),
          chunkDuration: (optimalChunkSize / this.chunkingConfig.bytesPerSecond).toFixed(2) + 's'
        });

        // Stream chunks using EFFICIENT MULTIPORT
        if (this.multiportConfig.enabled) {
          await this.streamChunksMultiport(socket, sessionId, chunks);
        } else {
          // Fallback to sequential transmission
          logger.info('Starting sequential chunk streaming', {
            sessionId,
            totalChunks: chunks.length,
            chunkSize: optimalChunkSize
          });
          
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

            logger.debug('Chunk transmitted', {
              sessionId,
              chunkIndex: i,
              totalChunks: chunks.length,
              isLastChunk
            });

            // Ensure sequential transmission with optimized delay
            await new Promise(resolve => setTimeout(resolve, this.chunkingConfig.sequentialDelay));
          }
          
          logger.info('Sequential chunk streaming completed', {
            sessionId,
            totalChunks: chunks.length
          });
        }

        // Send completion signal
        socket.emit('audio-complete', {
          sessionId,
          totalChunks: chunks.length
        });
        
        logger.info('Audio response completed successfully', {
          sessionId,
          totalChunks: chunks.length
        });
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
  
  // Stream chunks using TRUE PARALLEL MULTIPORT
  async streamChunksMultiport(socket, sessionId, chunks) {
    try {
      // Initialize multiport connections if not already done
      if (!this.multiportConnections.has(sessionId)) {
        this.initializeMultiportConnections(sessionId);
      }
      
      const connections = this.multiportConnections.get(sessionId);
      const totalChunks = chunks.length;
      
      logger.info('Starting TRUE PARALLEL multiport streaming', {
        sessionId,
        totalChunks,
        portCount: this.multiportConfig.maxPorts,
        maxConcurrent: this.multiportConfig.maxConcurrentChunks
      });
      
      // DISTRIBUTE CHUNKS ACROSS PORTS FOR PARALLEL TRANSMISSION
      const portChunks = Array.from({ length: this.multiportConfig.maxPorts }, () => []);
      
      // Round-robin distribution: chunk 0→port 0, chunk 1→port 1, chunk 2→port 2, chunk 3→port 0...
      for (let i = 0; i < chunks.length; i++) {
        const portId = i % this.multiportConfig.maxPorts;
        portChunks[portId].push({
          chunk: chunks[i],
          index: i,
          isLastChunk: i === chunks.length - 1
        });
      }
      
      // TRANSMIT CHUNKS IN PARALLEL ACROSS ALL PORTS
      const transmissionPromises = portChunks.map(async (portChunkList, portId) => {
        for (let j = 0; j < portChunkList.length; j++) {
          const { chunk, index, isLastChunk } = portChunkList[j];
          
          // Add small stagger per port to prevent overwhelming
          const portDelay = portId * this.multiportConfig.chunkDelay;
          await new Promise(resolve => setTimeout(resolve, portDelay));
          
          // Emit chunk with port information
          socket.emit('audio-chunk', {
            sessionId,
            chunkIndex: index,
            totalChunks: chunks.length,
            isLastChunk,
            audioData: chunk,
            progress: Math.round(((index + 1) / chunks.length) * 100) + '%',
            portId: portId,
            portNumber: this.multiportConfig.portBase + portId
          });
          
          // Update port statistics
          if (connections && connections.ports[portId]) {
            connections.ports[portId].chunkCount++;
            connections.ports[portId].lastChunkTime = Date.now();
          }
          
          logger.debug('PARALLEL chunk transmitted', {
            sessionId,
            chunkIndex: index,
            portId,
            portNumber: this.multiportConfig.portBase + portId,
            totalChunks
          });
          
          // Minimal delay for parallel transmission
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      });
      
      // EXECUTE ALL PORT TRANSMISSIONS IN PARALLEL
      await Promise.all(transmissionPromises);
      
      logger.info('TRUE PARALLEL multiport streaming completed', {
        sessionId,
        totalChunks,
        portStats: connections?.ports.map(p => ({
          portId: p.portId,
          chunkCount: p.chunkCount
        }))
      });
      
    } catch (error) {
      logger.error('Failed to stream chunks via multiport', { 
        sessionId, 
        error: error.message 
      });
      
      // Fallback to sequential transmission on error
      logger.info('Falling back to sequential transmission', { sessionId });
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
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
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

      // Clear audio buffer for this session
      if (this.audioBuffers.has(session.id)) {
        this.audioBuffers.delete(session.id);
        logger.info('Cleared audio buffer due to interruption', { sessionId: session.id });
      }

      // Clear audio queue in Gemini Live service
      this.geminiLiveService.clearAudioQueue();

      // Send interruption to Gemini Live session
      if (this.geminiLiveService.session) {
        try {
          this.geminiLiveService.session.interrupt();
          logger.info('Sent interruption to Gemini Live session', { sessionId: session.id });
        } catch (interruptError) {
          logger.warn('Failed to interrupt Gemini session', { error: interruptError.message });
        }
      }

      // Send confirmation to client
      socket.emit('interruption-handled', {
        sessionId: session.id,
        timestamp: new Date().toISOString()
      });

      logger.info('User interruption handled successfully', { sessionId: session.id });

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

      // End conversation management
      this.geminiLiveService.endConversation();

      // Clean up session
      this.activeSessions.delete(session.id);
      
      // Clean up multiport connections for this session
      if (this.multiportConnections.has(session.id)) {
        this.multiportConnections.delete(session.id);
        logger.info('Multiport connections cleaned up', { sessionId: session.id });
      }
      
      sessionManager.endSession(session.id);

      logger.info('Conversation ended', { 
        sessionId: session.id,
        conversationStats: this.geminiLiveService.getConversationStats()
      });

    } catch (error) {
      logger.error('Failed to end conversation', {
        sessionId: session?.id,
        socketId: socket.id,
        error: error.message
      });
    }
  }



  // Estimate audio duration from base64 data
  estimateAudioDuration(audioData) {
    try {
      const audioBuffer = Buffer.from(audioData, 'base64');
      
      // Check if it's a WAV file
      const isWAV = audioBuffer.length >= 12 && 
                   audioBuffer.slice(0, 4).toString() === 'RIFF' &&
                   audioBuffer.slice(8, 12).toString() === 'WAVE';
      
      if (isWAV && audioBuffer.length >= 44) {
        // Extract WAV parameters from header
        const sampleRate = audioBuffer.readUInt32LE(24);
        const channels = audioBuffer.readUInt16LE(22);
        const bitsPerSample = audioBuffer.readUInt16LE(34);
        const dataSize = audioBuffer.length - 44; // Subtract WAV header
        
        const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
        return dataSize / bytesPerSecond;
      } else {
        // For raw PCM at 48kHz, 16-bit, mono: 1 second = 48000 * 2 bytes
        const bytesPerSecond = 48000 * 2;
        return audioBuffer.length / bytesPerSecond;
      }
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
      
      // Check if first chunk is WAV
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
        newHeader.writeUInt32LE(combinedData.length, 40); // Update data chunk size
        
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

  // Calculate optimal chunk size based on audio duration
  calculateOptimalChunkSize(audioData) {
    try {
      const audioBuffer = Buffer.from(audioData, 'base64');
      const totalDuration = this.estimateAudioDuration(audioData);
      
      // Calculate target chunk size based on duration
      let targetChunkDuration = this.chunkingConfig.targetChunkDuration;
      
      // Adjust chunk duration based on total audio length
      if (totalDuration <= 3.0) {
        // Short responses: use larger chunks (1-2 seconds)
        targetChunkDuration = Math.max(1.0, totalDuration / 2);
      } else if (totalDuration <= 10.0) {
        // Medium responses: use 2-3 second chunks
        targetChunkDuration = 2.5;
      } else {
        // Long responses: use 3-5 second chunks
        targetChunkDuration = Math.min(5.0, totalDuration / 4);
      }
      
      // Calculate chunk size in bytes
      const chunkSizeBytes = Math.round(targetChunkDuration * this.chunkingConfig.bytesPerSecond);
      
      // Ensure chunk size is reasonable
      const minChunkSize = this.chunkingConfig.minChunkDuration * this.chunkingConfig.bytesPerSecond;
      const maxChunkSize = this.chunkingConfig.maxChunkDuration * this.chunkingConfig.bytesPerSecond;
      
      const finalChunkSize = Math.max(minChunkSize, Math.min(maxChunkSize, chunkSizeBytes));
      
      logger.info('Calculated optimal chunk size', {
        totalDuration: totalDuration.toFixed(2) + 's',
        targetChunkDuration: targetChunkDuration.toFixed(2) + 's',
        chunkSizeBytes: finalChunkSize,
        chunkSizeKB: Math.round(finalChunkSize / 1024),
        estimatedChunks: Math.ceil(audioBuffer.length / finalChunkSize)
      });
      
      return finalChunkSize;
    } catch (error) {
      logger.error('Failed to calculate optimal chunk size', { error: error.message });
      // Fallback to 2-second chunks
      return this.chunkingConfig.targetChunkDuration * this.chunkingConfig.bytesPerSecond;
    }
  }

  // Initialize multiport connections for a session
  initializeMultiportConnections(sessionId) {
    if (!this.multiportConfig.enabled) return;
    
    const connections = {
      ports: [],
      currentPort: 0,
      chunkQueue: [],
      activeChunks: 0
    };
    
    // Create virtual ports for chunk distribution
    for (let i = 0; i < this.multiportConfig.maxPorts; i++) {
      connections.ports.push({
        portId: i,
        portNumber: this.multiportConfig.portBase + i,
        chunkCount: 0,
        lastChunkTime: 0
      });
    }
    
    this.multiportConnections.set(sessionId, connections);
    
    logger.info('Multiport connections initialized', {
      sessionId,
      portCount: this.multiportConfig.maxPorts,
      basePort: this.multiportConfig.portBase
    });
  }
  
  // Get next available port for chunk transmission
  getNextPort(sessionId) {
    const connections = this.multiportConnections.get(sessionId);
    if (!connections) return 0;
    
    if (this.multiportConfig.chunkDistribution === 'round-robin') {
      // Round-robin distribution
      const port = connections.ports[connections.currentPort];
      connections.currentPort = (connections.currentPort + 1) % connections.ports.length;
      return port.portId;
    } else {
      // Size-based distribution (for future implementation)
      return connections.currentPort;
    }
  }
  
  // Split audio into chunks for streaming with multiport support
  splitAudioIntoChunks(audioData, chunkSize = null) {
    try {
      if (!audioData) {
        logger.warn('No audio data provided for chunking');
        return [];
      }

      // Use default chunk size if none provided (2 seconds of audio)
      if (!chunkSize) {
        chunkSize = this.chunkingConfig.targetChunkDuration * this.chunkingConfig.bytesPerSecond;
      }

      const audioBuffer = Buffer.from(audioData, 'base64');
      const chunks = [];

      // Check if it's a WAV file (has RIFF header)
      const isWAV = audioBuffer.length >= 12 && 
                   audioBuffer.slice(0, 4).toString() === 'RIFF' &&
                   audioBuffer.slice(8, 12).toString() === 'WAVE';

      if (isWAV) {
        logger.info('Detected WAV format, chunking while preserving playability');
        // For WAV files, we need to create proper WAV chunks
        // Each chunk will be a complete mini-WAV file with its own header
        const header = audioBuffer.slice(0, 44); // WAV header
        const audioData = audioBuffer.slice(44); // Audio data
        
        // Split audio data into chunks
        const dataChunkSize = chunkSize - 44; // Leave room for WAV header
        for (let i = 0; i < audioData.length; i += dataChunkSize) {
          const dataChunk = audioData.slice(i, Math.min(i + dataChunkSize, audioData.length));
          
          // Create new WAV file for this chunk
          const chunkHeader = Buffer.alloc(44);
          header.copy(chunkHeader); // Copy original header
          
          // Update header with chunk-specific sizes
          const chunkFileSize = 36 + dataChunk.length;
          chunkHeader.writeUInt32LE(chunkFileSize, 4); // File size
          chunkHeader.writeUInt32LE(dataChunk.length, 40); // Data chunk size
          
          // Combine header with data chunk
          const completeChunk = Buffer.concat([chunkHeader, dataChunk]);
          chunks.push(completeChunk.toString('base64'));
        }
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
        chunkSizeKB: Math.round(chunkSize / 1024),
        chunkDuration: (chunkSize / this.chunkingConfig.bytesPerSecond).toFixed(2) + 's',
        isWAV: isWAV,
        multiportEnabled: this.multiportConfig.enabled
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
      this.multiportConnections.clear();

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
      serviceType: 'Gemini Live API',
      multiport: {
        enabled: this.multiportConfig.enabled,
        maxPorts: this.multiportConfig.maxPorts,
        portBase: this.multiportConfig.portBase,
        chunkDelay: this.multiportConfig.chunkDelay,
        activeConnections: this.multiportConnections.size
      }
    };
  }
}

module.exports = VoiceHandlerLive; 