const express = require('express');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const sessionManager = require('../services/SessionManager');
const GeminiService = require('../services/GeminiService');
const logger = require('../utils/logger');

const router = express.Router();

// Create a new session
router.post('/create', asyncHandler(async (req, res) => {
  const { userId } = req.body;
  
  // This endpoint is primarily for REST-based session creation
  // WebSocket connections will auto-create sessions
  
  res.status(200).json({
    success: true,
    message: 'Please connect via WebSocket to start a voice session',
    websocketUrl: `ws${req.secure ? 's' : ''}://${req.get('host')}`,
    instructions: {
      events: {
        'start-conversation': 'Initialize voice session',
        'audio-chunk': 'Send audio data',
        'stop-speaking': 'User finished speaking',
        'interrupt': 'Interrupt AI response',
        'end-conversation': 'Close session'
      }
    }
  });
}));

// End a session
router.delete('/:sessionId', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new ApiError(404, 'Session not found');
  }
  
  const success = sessionManager.endSession(sessionId);
  
  res.status(200).json({
    success,
    message: success ? 'Session ended successfully' : 'Failed to end session',
    sessionId
  });
}));

// Get session details
router.get('/:sessionId', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    throw new ApiError(404, 'Session not found');
  }
  
  res.status(200).json({
    success: true,
    session: session.getSummary()
  });
}));

// Get all active sessions
router.get('/', asyncHandler(async (req, res) => {
  const activeSessions = sessionManager.getActiveSessions();
  
  res.status(200).json({
    success: true,
    count: activeSessions.length,
    sessions: activeSessions
  });
}));

// Export session data
router.get('/:sessionId/export', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  const sessionData = sessionManager.exportSession(sessionId);
  if (!sessionData) {
    throw new ApiError(404, 'Session not found');
  }
  
  res.status(200).json({
    success: true,
    data: sessionData
  });
}));

// Get session statistics
router.get('/stats/summary', asyncHandler(async (req, res) => {
  const stats = sessionManager.getStatistics();
  
  res.status(200).json({
    success: true,
    statistics: stats
  });
}));

module.exports = router; 