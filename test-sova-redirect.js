const { io } = require('socket.io-client');
const logger = require('./src/utils/logger');

// Quick test for Sova redirection
async function testSovaRedirection() {
  const socket = io('http://localhost:3000');
  
  const testQuestions = [
    'Who are you?',
    'What is microeconomics?',
    'Tell me about the weather',
    'What is the capital of France?',
    'How do I cook pasta?'
  ];
  
  socket.on('connect', () => {
    logger.info('Connected to Socket.IO server for Sova redirection testing...');
    
    // Start conversation
    socket.emit('start-conversation', {
      userId: 'test-user'
    });
    
    let questionIndex = 0;
    
    const askQuestion = () => {
      if (questionIndex < testQuestions.length) {
        const question = testQuestions[questionIndex];
        logger.info(`Testing: "${question}"`);
        
        socket.emit('text-input', {
          text: question
        });
        
        questionIndex++;
      } else {
        logger.info('All redirection tests completed');
        socket.disconnect();
      }
    };
    
    // Listen for responses
    socket.on('text-response', (data) => {
      const response = data.text;
      logger.info('Response received:', {
        question: testQuestions[questionIndex - 1],
        response: response.substring(0, 200) + (response.length > 200 ? '...' : ''),
        isRedirected: response.toLowerCase().includes('revolt') && 
                     (response.toLowerCase().includes('outside my area') || 
                      response.toLowerCase().includes('can\'t answer'))
      });
      
      // Wait a bit before asking next question
      setTimeout(askQuestion, 2000);
    });
    
    // Start with first question
    setTimeout(askQuestion, 1000);
  });
  
  socket.on('connect_error', (error) => {
    logger.error('Socket.IO connection error', { error: error.message });
  });
  
  socket.on('disconnect', (reason) => {
    logger.info('Disconnected from Socket.IO server', { reason });
  });
}

// Run the test
if (require.main === module) {
  testSovaRedirection().catch(error => {
    logger.error('Test failed', { error: error.message });
    process.exit(1);
  });
}

module.exports = { testSovaRedirection }; 