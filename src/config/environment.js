const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Environment configuration with validation
class EnvironmentConfig {
  constructor() {
    this.validateRequiredEnvVars();
  }

  validateRequiredEnvVars() {
    // Check if at least one API key is available
    const availableKeys = [
      process.env.GEMINI_API_KEY,
      process.env.BACKUP_KEY,
      process.env.BACKUP_KEY_ONE,
      process.env.BACKUP_KEY_TWO,
    ].filter(key => key && key.trim() !== '');

    if (availableKeys.length === 0) {
      throw new Error('Missing required environment variables: At least one of GEMINI_API_KEY, BACKUP_KEY, BACKUP_KEY_ONE, or BACKUP_KEY_TWO must be set');
    }
  }

  get config() {
    return {
      gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        backupKeys: [
          process.env.BACKUP_KEY,
          process.env.BACKUP_KEY_ONE,
          process.env.BACKUP_KEY_TWO
        ].filter(key => key && key.trim() !== ''),
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-live-001',
        maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS) || 2048,
        temperature: parseFloat(process.env.GEMINI_TEMPERATURE) || 0.7,
      },
      // Gemini 2.5 TTS is free and uses the same API key
      tts: {
        model: 'gemini-2.5-flash-preview-tts',
        voice: process.env.TTS_VOICE || 'Orus', // Default voice (Orus is often clearer)
      },
      server: {
        port: parseInt(process.env.PORT) || 3000,
        host: process.env.NODE_ENV === 'production' ? '0.0.0.0' : (process.env.HOST || 'localhost'),
        env: process.env.NODE_ENV || 'development',
      },
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true,
      },
      websocket: {
        pingTimeout: parseInt(process.env.WS_PING_TIMEOUT) || 60000,
        pingInterval: parseInt(process.env.WS_PING_INTERVAL) || 25000,
        maxPayload: parseInt(process.env.WS_MAX_PAYLOAD) || 10 * 1024 * 1024, // 10MB
      },
      audio: {
        sampleRate: parseInt(process.env.AUDIO_SAMPLE_RATE) || 16000,
        channels: parseInt(process.env.AUDIO_CHANNELS) || 1,
        bitDepth: parseInt(process.env.AUDIO_BIT_DEPTH) || 16,
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'json',
      }
    };
  }
}

module.exports = new EnvironmentConfig().config; 