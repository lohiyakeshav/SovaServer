const http = require('http');
const app = require('./app');
const socketServer = require('./websocket/SocketServer');
const sessionManager = require('./services/SessionManager');
const config = require('./config/environment');
const logger = require('./utils/logger');

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
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
    socketServer.shutdown();
    
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
  logger.info(`Server started`, {
    host: HOST,
    port: PORT,
    environment: config.server.env,
    websocket: `ws://${HOST}:${PORT}`,
    pid: process.pid
  });
  
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🎙️  Sova Voice Interface Backend                            ║
║                                                               ║
║   Server Status: ONLINE                                       ║
║   Environment: ${config.server.env.padEnd(46)}║
║   HTTP Server: http://${HOST}:${PORT}                        ${' '.repeat(Math.max(0, 31 - (HOST.length + PORT.toString().length)))}║
║   WebSocket: ws://${HOST}:${PORT}                           ${' '.repeat(Math.max(0, 33 - (HOST.length + PORT.toString().length)))}║
║                                                               ║
║   Gemini Model: ${config.gemini.model.padEnd(45)}║
║                                                               ║
║   API Endpoints:                                              ║
║   - Health Check: /api/health                                 ║
║   - Sessions: /api/session                                    ║
║                                                               ║
║   WebSocket Events:                                           ║
║   - start-conversation                                        ║
║   - audio-chunk                                               ║
║   - stop-speaking                                             ║
║   - interrupt                                                 ║
║   - end-conversation                                          ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

module.exports = server; 