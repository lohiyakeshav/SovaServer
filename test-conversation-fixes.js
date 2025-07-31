const { io } = require('socket.io-client');
const logger = require('./src/utils/logger');

// Test script to verify conversation fixes
async function testConversationFixes() {
  const socket = io('http://localhost:10000');
  
  socket.on('connect', () => {
    logger.info('Socket.IO connected, starting conversation test');
    
    // Start conversation
    socket.emit('start-conversation', {
      userId: 'test-user',
      voiceName: 'Orus'
    });
  });
  
  socket.on('session-status', (data) => {
    logger.info('Session started successfully:', data);
    
    // Send first query
    setTimeout(() => {
      logger.info('Sending first query...');
      socket.emit('stop-speaking', {
        transcription: 'Hello, can you tell me something about yourself?'
      });
    }, 1000);
  });
  
  socket.on('audio-chunk', (data) => {
    logger.info('Received audio chunk:', {
      chunkIndex: data.chunkIndex,
      totalChunks: data.totalChunks,
      isLastChunk: data.isLastChunk
    });
  });
  
  socket.on('audio-complete', (data) => {
    logger.info('Audio response completed:', data);
    
    // Send second query after a delay
    setTimeout(() => {
      logger.info('Sending second query...');
      socket.emit('stop-speaking', {
        transcription: 'Tell me something about microeconomics'
      });
    }, 2000);
  });
  
  socket.on('error', (error) => {
    logger.error('Socket error:', error);
  });
  
  socket.on('disconnect', (reason) => {
    logger.info('Socket disconnected:', reason);
  });
  
  // End test after 30 seconds
  setTimeout(() => {
    logger.info('Test completed, closing connection');
    socket.disconnect();
    process.exit(0);
  }, 30000);
}

// Run the test
if (require.main === module) {
  testConversationFixes().catch(error => {
    logger.error('Test failed:', error.message);
    process.exit(1);
  });
}

module.exports = { testConversationFixes }; 