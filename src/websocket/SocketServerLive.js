const { Server } = require('socket.io');
const VoiceHandlerLive = require('./handlers/VoiceHandlerLive');
const sessionManager = require('../services/SessionManager');
const logger = require('../utils/logger');
const config = require('../config/environment');

// WebSocket server setup and management for Gemini Live API
class SocketServerLive {
  constructor() {
    this.io = null;
    this.voiceHandler = new VoiceHandlerLive();
  }

  // Initialize Socket.IO server
  initialize(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: config.cors.origin,
        credentials: config.cors.credentials
      },
      pingTimeout: config.websocket.pingTimeout,
      pingInterval: config.websocket.pingInterval,
      maxHttpBufferSize: config.websocket.maxPayload,
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupEventHandlers();

    // Store instance globally for API access
    global.socketServerLive = this;

    logger.info('WebSocket server initialized with Gemini Live API');
    return this.io;
  }

  // Setup Socket.IO middleware
  setupMiddleware() {
    // Authentication middleware
    this.io.use((socket, next) => {
      const auth = socket.handshake.auth || {};
      const token = auth.token;
      
      // Add authentication logic here
      // For now, we'll accept all connections
      socket.userId = auth.userId || null;
      
      logger.logWebSocketEvent('connection-attempt', socket.id, {
        userId: socket.userId,
        address: socket.handshake.address
      });
      
      next();
    });

    // Error handling middleware
    this.io.use((socket, next) => {
      socket.on('error', (error) => {
        logger.error('Socket error', {
          socketId: socket.id,
          error: error.message
        });
      });
      next();
    });
  }

  // Setup main event handlers
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.logWebSocketEvent('connected', socket.id, {
        userId: socket.userId,
        transport: socket.conn.transport.name
      });

      // Setup voice chat handlers with Gemini Live
      this.voiceHandler.setupHandlers(socket);

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.logWebSocketEvent('disconnected', socket.id, { reason });
        sessionManager.handleSocketDisconnect(socket.id);
      });

      // Handle connection errors
      socket.on('connect_error', (error) => {
        logger.error('Socket connection error', {
          socketId: socket.id,
          error: error.message
        });
      });

      // Ping-pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Get session info
      socket.on('get-session-info', () => {
        const session = sessionManager.getSessionBySocketId(socket.id);
        if (session) {
          socket.emit('session-info', session.getSummary());
        } else {
          socket.emit('session-info', { status: 'no-session' });
        }
      });

      // Get service status
      socket.on('get-service-status', () => {
        const status = this.voiceHandler.getStatus();
        socket.emit('service-status', status);
      });

      // Test text input (for testing without audio)
      socket.on('test-text', async (data) => {
        try {
          const { text } = data;
          if (!text || text.trim().length === 0) {
            socket.emit('error', {
              type: 'invalid-input',
              message: 'No text provided for testing'
            });
            return;
          }

          logger.info('Testing text input with Gemini Live', {
            socketId: socket.id,
            text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
          });

          // Send test text to Gemini Live
          await this.voiceHandler.handleTextInput(socket, { text });

        } catch (error) {
          logger.error('Test text failed', {
            socketId: socket.id,
            error: error.message
          });
          
          socket.emit('error', {
            type: 'test-text-error',
            message: 'Failed to process test text',
            details: error.message
          });
        }
      });

      // Health check
      socket.on('health-check', () => {
        const health = {
          timestamp: Date.now(),
          socketId: socket.id,
          connected: socket.connected,
          transport: socket.conn.transport.name,
          serviceStatus: this.voiceHandler.getStatus()
        };
        
        socket.emit('health-response', health);
      });
    });

    // Setup admin namespace for monitoring
    this.setupAdminNamespace();
  }

  // Setup admin namespace for monitoring and debugging
  setupAdminNamespace() {
    const adminNamespace = this.io.of('/admin');
    
    adminNamespace.on('connection', (socket) => {
      logger.info('Admin connected', { socketId: socket.id });

      // Get all active sessions
      socket.on('get-all-sessions', () => {
        const sessions = sessionManager.getAllSessions();
        socket.emit('all-sessions', sessions);
      });

      // Get service status
      socket.on('get-service-status', () => {
        const status = this.voiceHandler.getStatus();
        socket.emit('service-status', status);
      });

      // Force cleanup
      socket.on('force-cleanup', async () => {
        try {
          await this.voiceHandler.cleanup();
          socket.emit('cleanup-complete', { success: true });
        } catch (error) {
          logger.error('Force cleanup failed', { error: error.message });
          socket.emit('cleanup-complete', { 
            success: false, 
            error: error.message 
          });
        }
      });

      // Broadcast message to all clients
      socket.on('broadcast', (data) => {
        this.io.emit('admin-broadcast', data);
        socket.emit('broadcast-sent', { success: true });
      });

      socket.on('disconnect', () => {
        logger.info('Admin disconnected', { socketId: socket.id });
      });
    });
  }

  // Get connections by transport type
  getConnectionsByTransport(transport) {
    const sockets = this.io.sockets.sockets;
    return Array.from(sockets.values()).filter(
      socket => socket.conn.transport.name === transport
    );
  }

  // Broadcast message to all connected clients
  broadcast(event, data) {
    this.io.emit(event, data);
  }

  // Broadcast message to specific session
  broadcastToSession(sessionId, event, data) {
    const session = sessionManager.getSession(sessionId);
    if (session && session.socketId) {
      this.io.to(session.socketId).emit(event, data);
    }
  }

  // Get Socket.IO instance
  getIO() {
    return this.io;
  }

  // Shutdown server gracefully
  async shutdown() {
    try {
      logger.info('Shutting down WebSocket server...');
      
      // Cleanup voice handler
      await this.voiceHandler.cleanup();
      
      // Close all connections
      if (this.io) {
        this.io.close();
      }
      
      logger.info('WebSocket server shutdown complete');
    } catch (error) {
      logger.error('Error during WebSocket shutdown', { error: error.message });
    }
  }

  // Get server statistics
  getStats() {
    if (!this.io) {
      return { error: 'Server not initialized' };
    }

    const sockets = this.io.sockets.sockets;
    const connections = Array.from(sockets.values());
    
    return {
      totalConnections: connections.length,
      transports: {
        websocket: connections.filter(s => s.conn.transport.name === 'websocket').length,
        polling: connections.filter(s => s.conn.transport.name === 'polling').length
      },
      serviceStatus: this.voiceHandler.getStatus(),
      uptime: process.uptime()
    };
  }
}

module.exports = SocketServerLive; 