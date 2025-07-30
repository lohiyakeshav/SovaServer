# Sova Voice Interface Backend

A robust, real-time voice interface backend built with Node.js, Express, Socket.IO, and the Gemini Live API. This backend provides seamless voice conversation capabilities with intelligent interruption handling and multi-language support.

## 🚀 Features

- **Real-time Voice Streaming**: Bidirectional audio streaming via WebSockets
- **Intelligent Interruption Handling**: Users can interrupt AI responses naturally
- **Multi-language Support**: Automatic language detection and response
- **Low Latency**: Optimized for < 2 second response times
- **Revolt Motors Context**: Focused conversations about electric vehicles
- **Session Management**: Comprehensive session tracking and analytics
- **Production-Ready**: Built with SOLID principles and best practices

## 📋 Prerequisites

- Node.js >= 14.0.0
- npm or yarn
- Gemini API key from [Google AI Studio](https://aistudio.google.com)

## 🛠️ Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd sova-server
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
Your `.env` file should contain:
```env
GEMINI_API_KEY=AIzaSy...  # Your Gemini API key

# Optional configurations
PORT=3000
HOST=localhost
NODE_ENV=development
GEMINI_MODEL=gemini-2.0-flash-live-001
CORS_ORIGIN=*
LOG_LEVEL=info
ADMIN_KEY=your-admin-key
```

## 🚀 Running the Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000` (or your configured port).

## 📡 API Endpoints

### REST API

#### Health Check
- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Detailed health status
- `GET /api/health/ready` - Readiness probe
- `GET /api/health/live` - Liveness probe

#### Session Management
- `POST /api/session/create` - Create new session (returns WebSocket instructions)
- `GET /api/session` - Get all active sessions
- `GET /api/session/:sessionId` - Get session details
- `DELETE /api/session/:sessionId` - End specific session
- `GET /api/session/:sessionId/export` - Export session data
- `GET /api/session/stats/summary` - Get session statistics

### WebSocket Events

#### Client → Server Events
- `start-conversation` - Initialize voice session
- `audio-chunk` - Send audio data chunk
- `stop-speaking` - User finished speaking
- `interrupt` - Interrupt AI response
- `end-conversation` - Close session
- `get-session-info` - Request session information
- `get-stats` - Request server statistics

#### Server → Client Events
- `session-status` - Session status updates
- `ai-speaking` - AI started processing/speaking
- `audio-response` - Audio chunk from AI
- `ai-finished` - AI completed response
- `error` - Error notifications
- `session-info` - Session information
- `server-stats` - Server statistics

## 🏗️ Architecture

The backend follows SOLID principles with a clean architecture:

```
src/
├── config/           # Configuration management
│   └── environment.js
├── controllers/      # Request handlers
├── services/         # Business logic
│   ├── GeminiService.js
│   └── SessionManager.js
├── websocket/        # WebSocket handling
│   ├── SocketServer.js
│   └── handlers/
│       └── VoiceHandler.js
├── models/          # Data models
│   └── Session.js
├── routes/          # REST API routes
│   ├── sessionRoutes.js
│   └── healthRoutes.js
├── middleware/      # Express middleware
│   └── errorHandler.js
├── utils/           # Utility functions
│   └── logger.js
├── app.js          # Express app setup
└── server.js       # Server entry point
```

## 🔧 Key Components

### GeminiService
Handles all interactions with the Gemini Live API, including:
- Chat session creation
- Audio stream processing
- Language detection
- Response generation

### SessionManager
Manages voice chat sessions with features like:
- Session lifecycle management
- Statistics tracking
- Automatic cleanup of inactive sessions
- Session export capabilities

### VoiceHandler
Processes WebSocket events for voice chat:
- Audio chunk streaming
- Interruption handling
- Real-time response streaming
- Error recovery

## 🔒 Security Features

- Helmet.js for security headers
- CORS configuration
- Request rate limiting ready
- Admin namespace with authentication
- Input validation and sanitization

## 📊 Monitoring

### Admin WebSocket Namespace
Connect to `/admin` namespace with admin key for:
- Real-time session monitoring
- Detailed server statistics
- Force-end sessions
- Performance metrics

## 🧪 Testing with WebSocket

Example WebSocket client connection:

```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:3000', {
  auth: {
    userId: 'test-user'
  }
});

socket.on('connect', () => {
  console.log('Connected');
  socket.emit('start-conversation');
});

socket.on('session-status', (data) => {
  console.log('Session:', data);
});

// Send audio chunks
socket.emit('audio-chunk', { audio: base64AudioData });
socket.emit('stop-speaking');

// Handle responses
socket.on('audio-response', (data) => {
  console.log('Received audio chunk:', data.index);
});
```

## 🚧 Important Notes

1. **Gemini Live API**: The native audio dialog model is in preview. The current implementation includes placeholders for audio transcription and text-to-speech that should be replaced with actual Gemini Live API calls when available.

2. **Audio Processing**: Currently simulates audio processing. In production, integrate with actual audio streaming capabilities.

3. **WebSocket Connection**: Ensure your client maintains a stable WebSocket connection for real-time audio streaming.

## 🤝 Contributing

1. Follow the existing code structure and SOLID principles
2. Add appropriate error handling
3. Update documentation for new features
4. Test thoroughly before submitting

## 📝 License

ISC

## 🆘 Troubleshooting

### Common Issues

1. **GEMINI_API_KEY not found**
   - Ensure `.env` file exists with valid API key
   - Check environment variable is loaded correctly

2. **WebSocket connection fails**
   - Verify CORS settings match your client origin
   - Check firewall/proxy settings

3. **High latency responses**
   - Check network connectivity
   - Consider using a closer Gemini API region
   - Optimize audio chunk sizes

### Debug Mode
Set `LOG_LEVEL=debug` in `.env` for detailed logging.

## 📞 Support

For issues or questions, please check the logs first:
- Application logs in console
- Detailed error messages in development mode
- Health check endpoints for service status 