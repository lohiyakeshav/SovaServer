const { Server } = require('socket.io');
const VoiceHandler = require('./handlers/VoiceHandler');
const sessionManager = require('../services/SessionManager');
const logger = require('../utils/logger');
const config = require('../config/environment');

// WebSocket server setup and management
class SocketServer {
  constructor() {
    this.io = null;
    this.voiceHandler = new VoiceHandler();
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

    logger.info('WebSocket server initialized');
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

      // Setup voice chat handlers
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

      // Get server statistics
      socket.on('get-stats', () => {
        socket.emit('server-stats', {
          sessions: sessionManager.getStatistics(),
          connections: this.io.engine.clientsCount,
          uptime: process.uptime()
        });
      });
    });

    // Admin namespace for monitoring
    this.setupAdminNamespace();
  }

  // Setup admin namespace for monitoring
  setupAdminNamespace() {
    const adminNamespace = this.io.of('/admin');

    adminNamespace.use((socket, next) => {
      // Add admin authentication here
      const auth = socket.handshake.auth || {};
      const adminKey = auth.adminKey;
      if (adminKey === process.env.ADMIN_KEY) {
        next();
      } else {
        next(new Error('Unauthorized'));
      }
    });

    adminNamespace.on('connection', (socket) => {
      logger.info('Admin connected', { socketId: socket.id });

      // Get all active sessions
      socket.on('get-all-sessions', () => {
        socket.emit('all-sessions', sessionManager.getActiveSessions());
      });

      // Get detailed statistics
      socket.on('get-detailed-stats', () => {
        socket.emit('detailed-stats', {
          sessions: sessionManager.getStatistics(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          connections: {
            total: this.io.engine.clientsCount,
            websocket: this.getConnectionsByTransport('websocket'),
            polling: this.getConnectionsByTransport('polling')
          }
        });
      });

      // Force end a session
      socket.on('force-end-session', (sessionId) => {
        const success = sessionManager.endSession(sessionId);
        socket.emit('session-ended', { sessionId, success });
      });
    });
  }

  // Get number of connections by transport type
  getConnectionsByTransport(transport) {
    let count = 0;
    for (const [id, socket] of this.io.of('/').sockets) {
      if (socket.conn.transport.name === transport) {
        count++;
      }
    }
    return count;
  }

  // Broadcast to all connected clients
  broadcast(event, data) {
    this.io.emit(event, data);
  }

  // Broadcast to specific session
  broadcastToSession(sessionId, event, data) {
    const session = sessionManager.getSession(sessionId);
    if (session && session.socketId) {
      this.io.to(session.socketId).emit(event, data);
    }
  }

  // Get Socket.IO server instance
  getIO() {
    return this.io;
  }

  // Shutdown WebSocket server
  shutdown() {
    if (this.io) {
      // Notify all clients
      this.broadcast('server-shutdown', {
        message: 'Server is shutting down',
        timestamp: Date.now()
      });

      // Close all connections
      this.io.close(() => {
        logger.info('WebSocket server shut down');
      });

      // Clean up handlers
      this.voiceHandler.cleanup();
    }
  }
}

// Export singleton instance
module.exports = new SocketServer(); 