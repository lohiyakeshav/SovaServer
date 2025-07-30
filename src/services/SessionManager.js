const Session = require('../models/Session');
const logger = require('../utils/logger');

// Manages voice chat sessions
class SessionManager {
  constructor() {
    this.sessions = new Map(); // sessionId -> Session
    this.socketToSession = new Map(); // socketId -> sessionId
    this.cleanupInterval = null;
    this.startCleanupTask();
  }

  // Create a new session
  createSession(socketId, userId = null) {
    try {
      const session = new Session(socketId, userId);
      this.sessions.set(session.id, session);
      this.socketToSession.set(socketId, session.id);
      
      logger.info('Session created', { 
        sessionId: session.id, 
        socketId,
        totalSessions: this.sessions.size 
      });
      
      return session;
    } catch (error) {
      logger.error('Failed to create session', { socketId, error: error.message });
      throw error;
    }
  }

  // Get session by ID
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  // Get session by socket ID
  getSessionBySocketId(socketId) {
    const sessionId = this.socketToSession.get(socketId);
    return sessionId ? this.getSession(sessionId) : null;
  }

  // Update session
  updateSession(sessionId, updates) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Apply updates
    Object.keys(updates).forEach(key => {
      if (key in session && typeof updates[key] !== 'undefined') {
        session[key] = updates[key];
      }
    });

    session.lastActivity = new Date();
    return session;
  }

  // End session
  endSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      logger.warn('Attempted to end non-existent session', { sessionId });
      return false;
    }

    session.updateStatus('ended');
    session.metadata.totalDuration = session.getDuration();
    
    // Clean up mappings
    this.socketToSession.delete(session.socketId);
    this.sessions.delete(sessionId);

    logger.info('Session ended', {
      sessionId,
      duration: session.metadata.totalDuration,
      interruptions: session.metadata.interruptions,
      messages: session.metadata.messageCount
    });

    return true;
  }

  // Handle socket disconnection
  handleSocketDisconnect(socketId) {
    const session = this.getSessionBySocketId(socketId);
    if (session) {
      this.endSession(session.id);
    }
  }

  // Get all active sessions
  getActiveSessions() {
    const activeSessions = [];
    this.sessions.forEach(session => {
      if (session.status === 'active' || session.status === 'initialized') {
        activeSessions.push(session.getSummary());
      }
    });
    return activeSessions;
  }

  // Get session statistics
  getStatistics() {
    const stats = {
      totalSessions: this.sessions.size,
      activeSessions: 0,
      endedSessions: 0,
      totalInterruptions: 0,
      averageDuration: 0,
      languageDistribution: {}
    };

    let totalDuration = 0;
    this.sessions.forEach(session => {
      if (session.status === 'active') stats.activeSessions++;
      if (session.status === 'ended') stats.endedSessions++;
      
      stats.totalInterruptions += session.metadata.interruptions;
      totalDuration += session.getDuration();

      const lang = session.metadata.language;
      stats.languageDistribution[lang] = (stats.languageDistribution[lang] || 0) + 1;
    });

    if (this.sessions.size > 0) {
      stats.averageDuration = totalDuration / this.sessions.size;
    }

    return stats;
  }

  // Clean up inactive sessions
  cleanupInactiveSessions(inactivityThreshold = 300000) { // 5 minutes
    const now = new Date();
    const sessionsToRemove = [];

    this.sessions.forEach((session, sessionId) => {
      const inactiveTime = now - session.lastActivity;
      if (inactiveTime > inactivityThreshold && session.status !== 'active') {
        sessionsToRemove.push(sessionId);
      }
    });

    sessionsToRemove.forEach(sessionId => {
      logger.info('Cleaning up inactive session', { sessionId });
      this.endSession(sessionId);
    });

    return sessionsToRemove.length;
  }

  // Start periodic cleanup task
  startCleanupTask() {
    this.cleanupInterval = setInterval(() => {
      const cleaned = this.cleanupInactiveSessions();
      if (cleaned > 0) {
        logger.info('Cleaned up inactive sessions', { count: cleaned });
      }
    }, 60000); // Run every minute
  }

  // Stop cleanup task
  stopCleanupTask() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Export session data
  exportSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    return {
      ...session.toJSON(),
      exportedAt: new Date(),
      statistics: {
        duration: session.getDuration(),
        messagesPerMinute: session.metadata.messageCount / (session.getDuration() / 60000)
      }
    };
  }

  // Shutdown manager
  shutdown() {
    this.stopCleanupTask();
    
    // End all active sessions
    this.sessions.forEach((session, sessionId) => {
      if (session.status === 'active') {
        this.endSession(sessionId);
      }
    });

    logger.info('SessionManager shutdown complete', {
      remainingSessions: this.sessions.size
    });
  }
}

// Export singleton instance
module.exports = new SessionManager(); 