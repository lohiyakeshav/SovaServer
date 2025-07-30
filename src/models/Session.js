const { v4: uuidv4 } = require('uuid');

// Session model representing a voice chat session
class Session {
  constructor(socketId, userId = null) {
    this.id = uuidv4();
    this.socketId = socketId;
    this.userId = userId;
    this.status = 'initialized'; // initialized, active, interrupted, ended
    this.createdAt = new Date();
    this.lastActivity = new Date();
    this.metadata = {
      language: 'en',
      audioFormat: 'webm',
      interruptions: 0,
      totalDuration: 0,
      messageCount: 0
    };
    this.geminiSession = null; // Will hold Gemini session reference
    this.audioBuffer = []; // Buffer for audio chunks
    this.isAISpeaking = false;
    this.conversationHistory = [];
  }

  // Update session status
  updateStatus(status) {
    const validStatuses = ['initialized', 'active', 'interrupted', 'ended'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    this.status = status;
    this.lastActivity = new Date();
  }

  // Add audio chunk to buffer
  addAudioChunk(chunk) {
    this.audioBuffer.push(chunk);
    this.lastActivity = new Date();
  }

  // Clear audio buffer
  clearAudioBuffer() {
    this.audioBuffer = [];
  }

  // Track interruption
  recordInterruption() {
    this.metadata.interruptions++;
    this.isAISpeaking = false;
    this.updateStatus('interrupted');
  }

  // Update conversation history
  addToHistory(role, content, timestamp = new Date()) {
    this.conversationHistory.push({
      role, // 'user' or 'assistant'
      content,
      timestamp
    });
    this.metadata.messageCount++;
  }

  // Calculate session duration
  getDuration() {
    return new Date() - this.createdAt;
  }

  // Get session summary
  getSummary() {
    return {
      id: this.id,
      socketId: this.socketId,
      status: this.status,
      duration: this.getDuration(),
      metadata: this.metadata,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity
    };
  }

  // Serialize for storage or transmission
  toJSON() {
    return {
      id: this.id,
      socketId: this.socketId,
      userId: this.userId,
      status: this.status,
      metadata: this.metadata,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      conversationHistory: this.conversationHistory
    };
  }
}

module.exports = Session; 