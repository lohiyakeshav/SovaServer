const winston = require('winston');
const config = require('../config/environment');

// Custom format for better readability
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaString}`;
  })
);

// Create logger instance
class Logger {
  constructor() {
    this.logger = winston.createLogger({
      level: config.logging.level,
      format: config.logging.format === 'json' ? winston.format.json() : customFormat,
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    // Add file transport in production
    if (config.server.env === 'production') {
      this.logger.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }));
      
      this.logger.add(new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }));
    }
  }

  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  error(message, meta = {}) {
    this.logger.error(message, meta);
  }

  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  // Specific logging for audio streaming
  logAudioEvent(event, sessionId, data = {}) {
    this.logger.info(`Audio Event: ${event}`, {
      sessionId,
      timestamp: new Date().toISOString(),
      ...data
    });
  }

  // Specific logging for WebSocket events
  logWebSocketEvent(event, socketId, data = {}) {
    this.logger.info(`WebSocket Event: ${event}`, {
      socketId,
      timestamp: new Date().toISOString(),
      ...data
    });
  }

  // Specific logging for Gemini API interactions
  logGeminiEvent(event, sessionId, data = {}) {
    this.logger.info(`Gemini API Event: ${event}`, {
      sessionId,
      timestamp: new Date().toISOString(),
      ...data
    });
  }
}

module.exports = new Logger(); 