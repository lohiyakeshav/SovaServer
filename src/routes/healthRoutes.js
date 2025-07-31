const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Simple health check for Render
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Health check endpoint
router.get('/health', (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
      environment: process.env.NODE_ENV || 'development'
    };

    // Add WebSocket statistics if available
    if (global.socketServerLive) {
      health.websocket = global.socketServerLive.getStats();
    }

    res.status(200).json(health);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Detailed health check with more information
router.get('/detailed', (req, res) => {
  try {
    const detailedHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };

    // Add WebSocket statistics if available
    if (global.socketServerLive) {
      detailedHealth.websocket = global.socketServerLive.getStats();
    }

    res.status(200).json(detailedHealth);
  } catch (error) {
    logger.error('Detailed health check failed', { error: error.message });
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router; 