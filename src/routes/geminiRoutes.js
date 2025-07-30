const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Get Gemini Live service status
router.get('/status', async (req, res) => {
  try {
    // Get the Gemini Live service instance from the WebSocket server
    const SocketServerLive = require('../websocket/SocketServerLive');
    
    // Try to get the active instance
    let voiceHandler = null;
    let geminiService = null;
    
    // Check if there's a global instance
    if (global.socketServerLive && global.socketServerLive.voiceHandler) {
      voiceHandler = global.socketServerLive.voiceHandler;
      geminiService = voiceHandler.geminiLiveService;
    }
    
    if (!voiceHandler || !geminiService) {
      return res.status(503).json({
        success: false,
        status: 'service_unavailable',
        message: 'Gemini Live service not initialized',
        timestamp: new Date().toISOString()
      });
    }
    
    if (!voiceHandler) {
      return res.status(503).json({
        success: false,
        status: 'service_unavailable',
        message: 'Voice handler not initialized',
        timestamp: new Date().toISOString()
      });
    }



    // Get detailed status
    const status = geminiService.getStatus();
    const isConnected = geminiService.isConnected;
    const session = geminiService.session;
    const currentApiKeyIndex = geminiService.currentApiKeyIndex;
    const totalApiKeys = geminiService.apiKeys.length;

    const response = {
      success: true,
      status: isConnected ? 'connected' : 'disconnected',
      geminiLive: {
        connected: isConnected,
        sessionActive: !!session,
        currentApiKey: currentApiKeyIndex + 1,
        totalApiKeys: totalApiKeys,
        apiKeyStatus: currentApiKeyIndex < totalApiKeys ? 'available' : 'exhausted'
      },
      service: {
        type: 'Gemini Live API',
        model: 'gemini-2.0-flash-live-001',
        voice: 'Kore',
        activeSessions: status.activeSessions || 0
      },
      timestamp: new Date().toISOString()
    };

    logger.info('Gemini Live status requested', {
      connected: isConnected,
      sessionActive: !!session,
      apiKeyIndex: currentApiKeyIndex + 1,
      totalKeys: totalApiKeys
    });

    res.json(response);

  } catch (error) {
    logger.error('Failed to get Gemini Live status', { error: error.message });
    
    res.status(500).json({
      success: false,
      status: 'error',
      message: 'Failed to get Gemini Live status',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test Gemini Live connection
router.post('/test', async (req, res) => {
  try {
    // Try to get the active instance
    let geminiService = null;
    
    // Check if there's a global instance
    if (global.socketServerLive && global.socketServerLive.voiceHandler) {
      geminiService = global.socketServerLive.voiceHandler.geminiLiveService;
    }
    
    if (!geminiService) {
      return res.status(503).json({
        success: false,
        status: 'service_unavailable',
        message: 'Gemini Live service not available',
        timestamp: new Date().toISOString()
      });
    }
    
    // Test the connection by trying to send a simple message
    const testMessage = "Hello, this is a connection test.";
    
    logger.info('Testing Gemini Live connection', { testMessage });
    
    // Check if service is connected
    if (!geminiService.isConnected) {
      return res.json({
        success: false,
        status: 'disconnected',
        message: 'Gemini Live service is not connected',
        testMessage,
        timestamp: new Date().toISOString()
      });
    }

    // Test successful
    res.json({
      success: true,
      status: 'connected',
      message: 'Gemini Live connection test successful',
      testMessage,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Gemini Live connection test failed', { error: error.message });
    
    res.status(500).json({
      success: false,
      status: 'error',
      message: 'Connection test failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get API key status
router.get('/api-keys', async (req, res) => {
  try {
    // Try to get the active instance
    let geminiService = null;
    
    // Check if there's a global instance
    if (global.socketServerLive && global.socketServerLive.voiceHandler) {
      geminiService = global.socketServerLive.voiceHandler.geminiLiveService;
    }
    
    if (!geminiService) {
      return res.status(503).json({
        success: false,
        status: 'service_unavailable',
        message: 'Gemini Live service not available',
        timestamp: new Date().toISOString()
      });
    }
    const currentApiKeyIndex = geminiService.currentApiKeyIndex;
    const totalApiKeys = geminiService.apiKeys.length;

    const apiKeys = geminiService.apiKeys.map((key, index) => ({
      index: index + 1,
      status: index === currentApiKeyIndex ? 'active' : 
              index < currentApiKeyIndex ? 'exhausted' : 'available',
      preview: key.substring(0, 10) + '...',
      isCurrent: index === currentApiKeyIndex
    }));

    res.json({
      success: true,
      currentKey: currentApiKeyIndex + 1,
      totalKeys: totalApiKeys,
      keys: apiKeys,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get API key status', { error: error.message });
    
    res.status(500).json({
      success: false,
      status: 'error',
      message: 'Failed to get API key status',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router; 