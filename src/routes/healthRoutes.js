const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const GeminiLiveService = require('../services/GeminiLiveService');
const sessionManager = require('../services/SessionManager');
const config = require('../config/environment');

const router = express.Router();

// Basic health check
router.get('/', asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.server.env
  });
}));

// Detailed health check
router.get('/detailed', asyncHandler(async (req, res) => {
  const geminiLiveService = new GeminiLiveService();
  
  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const geminiConfig = await geminiLiveService.validateConfiguration();
  
  const health = {
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      environment: config.server.env,
      nodeVersion: process.version
    },
    services: {
      gemini: {
        configured: geminiConfig.isValid,
        model: geminiConfig.model,
        voice: geminiConfig.voice,
        connected: geminiConfig.isConnected,
        error: geminiConfig.error || null
      },
      sessions: sessionManager.getStatistics()
    },
    config: {
      cors: config.cors.origin,
      websocket: {
        pingTimeout: config.websocket.pingTimeout,
        pingInterval: config.websocket.pingInterval
      }
    }
  };
  
  res.status(200).json(health);
}));

// Readiness check
router.get('/ready', asyncHandler(async (req, res) => {
  const geminiLiveService = new GeminiLiveService();
  
  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const geminiConfig = await geminiLiveService.validateConfiguration();
  
  if (!geminiConfig.isValid) {
    res.status(503).json({
      success: false,
      status: 'not_ready',
      reason: 'Gemini Live API configuration invalid',
      error: geminiConfig.error
    });
    return;
  }
  
  res.status(200).json({
    success: true,
    status: 'ready',
    timestamp: new Date().toISOString()
  });
}));

// Liveness check
router.get('/live', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

module.exports = router; 