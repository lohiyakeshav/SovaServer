const http = require('http');
const app = require('./app');
const SocketServerLive = require('./websocket/SocketServerLive');
const sessionManager = require('./services/SessionManager');
const config = require('./config/environment');
const logger = require('./utils/logger');

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server with Gemini Live API
const socketServer = new SocketServerLive();
socketServer.initialize(server);

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} signal received: starting graceful shutdown`);
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Give ongoing requests 30 seconds to complete
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);

  try {
    // Shutdown WebSocket server
    await socketServer.shutdown();
    
    // Shutdown session manager
    sessionManager.shutdown();
    
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
};

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { 
    reason: reason?.message || reason, 
    stack: reason?.stack,
    promise 
  });
  
  // Don't shut down for unhandled rejections, just log them
  // This prevents server crashes from temporary API issues
  console.error('Unhandled Promise Rejection:', reason);
});

// Start server
const PORT = config.server.port;
const HOST = config.server.host;

server.listen(PORT, HOST, () => {
  logger.info(`Server started with Gemini Live API`, {
    host: HOST,
    port: PORT,
    environment: config.server.env,
    websocket: `ws://${HOST}:${PORT}`,
    pid: process.pid
  });
  
  // Setup periodic cleanup for WebSocket connection tracking
  setInterval(() => {
    if (socketServer && socketServer.cleanupOldAttempts) {
      socketServer.cleanupOldAttempts();
    }
  }, 300000); // Clean up every 5 minutes
  
  // Different startup message for production vs development
  if (config.server.env === 'production') {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🎙️  Sova Voice Interface Backend (Gemini Live)              ║
║                                                               ║
║   Server Status: ONLINE                                       ║
║   Environment: production                                    ║
║   HTTP Server: http://0.0.0.0:${PORT}                        ║
║   WebSocket: ws://0.0.0.0:${PORT}                             ║
║                                                               ║
║   Gemini Live Model: gemini-2.5-flash-preview-native-audio   ║
║   Voice: ${(config.tts?.voice || 'Orus').padEnd(45)}║
║                                                               ║
║   API Endpoints:                                              ║
║   - Health Check: /api/health                                 ║
║   - Sessions: /api/session                                    ║
║                                                               ║
║   WebSocket Events:                                           ║
║   - start-conversation                                        ║
║   - audio-chunk                                               ║
║   - text-input (for testing)                                  ║
║   - stop-speaking                                             ║
║   - interrupt                                                 ║
║   - end-conversation                                          ║
║                                                               ║
║   Admin Endpoints:                                            ║
║   - /admin (WebSocket namespace)                              ║
║   - get-service-status                                        ║
║   - test-text                                                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  } else {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🎙️  Sova Voice Interface Backend (Gemini Live)              ║
║                                                               ║
║   Server Status: ONLINE                                       ║
║   Environment: ${config.server.env.padEnd(46)}║
║   HTTP Server: http://${HOST}:${PORT}                        ${' '.repeat(Math.max(0, 31 - (HOST.length + PORT.toString().length)))}║
║   WebSocket: ws://${HOST}:${PORT}                           ${' '.repeat(Math.max(0, 33 - (HOST.length + PORT.toString().length)))}║
║                                                               ║
║   Gemini Live Model: gemini-2.5-flash-preview-native-audio   ║
║   Voice: ${(config.tts?.voice || 'Orus').padEnd(45)}║
║                                                               ║
║   API Endpoints:                                              ║
║   - Health Check: /api/health                                 ║
║   - Sessions: /api/session                                    ║
║                                                               ║
║   WebSocket Events:                                           ║
║   - start-conversation                                        ║
║   - audio-chunk                                               ║
║   - text-input (for testing)                                  ║
║   - stop-speaking                                             ║
║   - interrupt                                                 ║
║   - end-conversation                                          ║
║                                                               ║
║   Admin Endpoints:                                            ║
║   - /admin (WebSocket namespace)                              ║
║   - get-service-status                                        ║
║   - test-text                                                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  }
}).on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use. Please stop the existing server or use a different port.`, {
      port: PORT,
      error: error.message
    });
    console.error(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ❌ PORT CONFLICT ERROR                                      ║
║                                                               ║
║   Port ${PORT} is already in use.                            ║
║                                                               ║
║   Solutions:                                                  ║
║   1. Kill the existing process:                              ║
║      lsof -ti:${PORT} | xargs kill -9                        ║
║                                                               ║
║   2. Use a different port:                                   ║
║      PORT=3001 npm run dev                                   ║
║                                                               ║
║   3. Check for other servers:                                ║
║      lsof -i :${PORT}                                        ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  } else {
    logger.error('Server failed to start', { error: error.message });
    console.error('❌ Server failed to start:', error.message);
  }
  process.exit(1);
});

// Export server for testing
module.exports = server; 