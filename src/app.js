const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const config = require('./config/environment');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Import routes
const sessionRoutes = require('./routes/sessionRoutes');
const healthRoutes = require('./routes/healthRoutes');

// Create Express app
const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "wss:", "ws:"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  }
}));

// CORS configuration
app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Request logging
if (config.server.env === 'development') {
  app.use(morgan('dev'));
} else {
  // Custom morgan format for production
  app.use(morgan(':method :url :status :res[content-length] - :response-time ms', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
}

// Request ID middleware
app.use((req, res, next) => {
  req.id = require('crypto').randomBytes(16).toString('hex');
  res.setHeader('X-Request-ID', req.id);
  next();
});

// API routes
app.use('/api/session', sessionRoutes);
app.use('/api/health', healthRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Sova Voice Interface Backend',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      health: '/api/health',
      sessions: '/api/session',
      websocket: `ws${config.server.env === 'production' ? 's' : ''}://${req.get('host')}`
    },
    documentation: {
      websocket: {
        events: {
          client: [
            'start-conversation',
            'audio-chunk',
            'stop-speaking',
            'interrupt',
            'end-conversation',
            'get-session-info',
            'get-stats'
          ],
          server: [
            'session-status',
            'ai-speaking',
            'audio-response',
            'ai-finished',
            'error',
            'session-info',
            'server-stats'
          ]
        }
      }
    }
  });
});

// Error handlers (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app; 