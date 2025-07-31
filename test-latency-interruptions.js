const WebSocket = require('ws');
const logger = require('./src/utils/logger');

// Test script for latency and interruption optimizations
class LatencyInterruptionTester {
  constructor() {
    this.ws = null;
    this.testResults = {
      latency: [],
      interruptions: [],
      errors: []
    };
    this.startTime = null;
    this.interruptionStartTime = null;
  }

  // Connect to WebSocket server
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket('ws://localhost:3000');
      
      this.ws.on('open', () => {
        logger.info('Connected to WebSocket server');
        resolve();
      });
      
      this.ws.on('error', (error) => {
        logger.error('WebSocket connection error', { error: error.message });
        reject(error);
      });
    });
  }

  // Test latency optimization
  async testLatency() {
    logger.info('Starting latency test...');
    
    return new Promise((resolve) => {
      this.startTime = Date.now();
      
      // Start conversation
      this.ws.send(JSON.stringify({
        event: 'start-conversation',
        data: { userId: 'test-user' }
      }));
      
      // Send text input after a short delay
      setTimeout(() => {
        this.ws.send(JSON.stringify({
          event: 'text-input',
          data: { text: 'Hello, this is a latency test. Please respond quickly.' }
        }));
        logger.info('Text input sent, measuring response time...');
      }, 1000);
      
      // Listen for audio chunks
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          
          if (message.event === 'audio-chunk') {
            const responseTime = Date.now() - this.startTime;
            
            if (message.data.isFirstChunk && message.data.immediate) {
              logger.info('First chunk received immediately', {
                responseTime: responseTime + 'ms',
                chunkIndex: message.data.chunkIndex,
                immediate: message.data.immediate
              });
              
              this.testResults.latency.push({
                type: 'first-chunk',
                responseTime,
                timestamp: new Date().toISOString()
              });
            }
            
            if (message.data.isLastChunk) {
              logger.info('Last chunk received', {
                totalResponseTime: responseTime + 'ms',
                totalChunks: message.data.totalChunks,
                latencyOptimized: message.data.latencyOptimized
              });
              
              this.testResults.latency.push({
                type: 'complete-response',
                responseTime,
                totalChunks: message.data.totalChunks,
                timestamp: new Date().toISOString()
              });
              
              resolve();
            }
          }
        } catch (error) {
          logger.error('Error parsing message', { error: error.message });
        }
      });
    });
  }

  // Test interruption handling
  async testInterruption() {
    logger.info('Starting interruption test...');
    
    return new Promise((resolve) => {
      this.interruptionStartTime = Date.now();
      
      // Start conversation
      this.ws.send(JSON.stringify({
        event: 'start-conversation',
        data: { userId: 'test-user' }
      }));
      
      // Send text input
      setTimeout(() => {
        this.ws.send(JSON.stringify({
          event: 'text-input',
          data: { text: 'Please give me a long response so I can interrupt you.' }
        }));
        logger.info('Text input sent, waiting for response...');
      }, 1000);
      
      // Interrupt after 2 seconds
      setTimeout(() => {
        logger.info('Sending interruption...');
        this.ws.send(JSON.stringify({
          event: 'interrupt',
          data: { sessionId: 'test-session' }
        }));
      }, 3000);
      
      // Listen for interruption events
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          
          if (message.event === 'interruption-confirmed') {
            const responseTime = Date.now() - this.interruptionStartTime;
            logger.info('Interruption confirmed', {
              responseTime: responseTime + 'ms',
              message: message.data.message
            });
            
            this.testResults.interruptions.push({
              type: 'confirmation',
              responseTime,
              timestamp: new Date().toISOString()
            });
          }
          
          if (message.event === 'interruption-successful') {
            const responseTime = Date.now() - this.interruptionStartTime;
            logger.info('Interruption successful', {
              responseTime: responseTime + 'ms',
              message: message.data.message
            });
            
            this.testResults.interruptions.push({
              type: 'successful',
              responseTime,
              timestamp: new Date().toISOString()
            });
          }
          
          if (message.event === 'interruption-handled') {
            const responseTime = Date.now() - this.interruptionStartTime;
            logger.info('Interruption handled', {
              responseTime: responseTime + 'ms',
              status: message.data.status
            });
            
            this.testResults.interruptions.push({
              type: 'handled',
              responseTime,
              status: message.data.status,
              timestamp: new Date().toISOString()
            });
            
            resolve();
          }
        } catch (error) {
          logger.error('Error parsing message', { error: error.message });
        }
      });
    });
  }

  // Run comprehensive test
  async runTests() {
    try {
      await this.connect();
      
      logger.info('=== LATENCY TEST ===');
      await this.testLatency();
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      logger.info('=== INTERRUPTION TEST ===');
      await this.testInterruption();
      
      // Print results
      this.printResults();
      
    } catch (error) {
      logger.error('Test failed', { error: error.message });
    } finally {
      if (this.ws) {
        this.ws.close();
      }
    }
  }

  // Print test results
  printResults() {
    logger.info('=== TEST RESULTS ===');
    
    // Latency results
    if (this.testResults.latency.length > 0) {
      logger.info('LATENCY RESULTS:');
      this.testResults.latency.forEach(result => {
        const status = result.responseTime <= 2000 ? '✅ PASS' : '❌ FAIL';
        logger.info(`${status} ${result.type}: ${result.responseTime}ms`);
      });
    }
    
    // Interruption results
    if (this.testResults.interruptions.length > 0) {
      logger.info('INTERRUPTION RESULTS:');
      this.testResults.interruptions.forEach(result => {
        const status = result.responseTime <= 100 ? '✅ PASS' : '❌ FAIL';
        logger.info(`${status} ${result.type}: ${result.responseTime}ms`);
      });
    }
    
    // Summary
    const latencyPass = this.testResults.latency.filter(r => r.responseTime <= 2000).length;
    const interruptionPass = this.testResults.interruptions.filter(r => r.responseTime <= 100).length;
    
    logger.info('=== SUMMARY ===');
    logger.info(`Latency tests: ${latencyPass}/${this.testResults.latency.length} passed`);
    logger.info(`Interruption tests: ${interruptionPass}/${this.testResults.interruptions.length} passed`);
    
    if (latencyPass === this.testResults.latency.length && 
        interruptionPass === this.testResults.interruptions.length) {
      logger.info('🎉 ALL TESTS PASSED - Functional requirements met!');
    } else {
      logger.warn('⚠️ Some tests failed - Check configuration');
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new LatencyInterruptionTester();
  tester.runTests().catch(error => {
    logger.error('Test execution failed', { error: error.message });
    process.exit(1);
  });
}

module.exports = LatencyInterruptionTester; 