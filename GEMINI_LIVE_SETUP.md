# 🎙️ Gemini Live API Setup Guide

This guide will help you set up and run the **Gemini 2.5 Live API** for real-time audio conversation with actual human speech.

## 🚀 What You'll Get

✅ **Real human speech** (not frequency tones)  
✅ **High-quality neural voices** (Orus, Kore, etc.)  
✅ **Real-time conversation**  
✅ **Free to use** (uses your existing Gemini API key)  
✅ **Native audio support**  

## 📋 Prerequisites

1. **Gemini API Key** - You already have this
2. **Node.js** - Version 14 or higher
3. **Internet connection** - For API calls

## 🔧 Installation

### 1. Install Dependencies

```bash
npm install @google/genai
```

### 2. Verify Your Environment

Make sure your `.env` file has:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Test the Setup

```bash
node test-gemini-live.js
```

This will test:
- ✅ API key validation
- ✅ Gemini Live connection
- ✅ Text-to-speech functionality
- ✅ Audio generation

## 🎯 Running the Live Server

### Development Mode (with auto-restart)

```bash
npm run dev:live
```

### Production Mode

```bash
npm run start:live
```

## 🔍 What's Different from the Old Server

| Feature | Old Server | Live Server |
|---------|------------|-------------|
| **TTS Quality** | Simulated tones | Real human speech |
| **Voice Options** | None | Multiple neural voices |
| **API** | Gemini 1.5 + Simulated TTS | Gemini 2.5 Live |
| **Real-time** | Basic | Full native support |
| **Audio Format** | Generated WAV | Native audio |

## 🎵 Available Voices

The Live API supports these voices:

- **Orus** (default) - Natural male voice
- **Kore** - Natural female voice
- **And more...**

To change the voice, update your `.env`:

```env
TTS_VOICE=Kore
```

## 🧪 Testing

### 1. Test the API Connection

```bash
node test-gemini-live.js
```

### 2. Test with WebSocket Client

Connect to `ws://localhost:3000` and send:

```javascript
// Start conversation
socket.emit('start-conversation', { userId: 'test-user' });

// Send text input (for testing)
socket.emit('text-input', { text: 'Hello! Can you hear me?' });

// Listen for responses
socket.on('audio-chunk', (data) => {
  console.log('Received audio chunk:', data);
});

socket.on('text-response', (data) => {
  console.log('Received text:', data.text);
});
```

### 3. Test with Frontend

Your existing frontend should work with the Live server. Just connect to the new WebSocket endpoint.

## 🔧 Configuration

### Environment Variables

```env
# Required
GEMINI_API_KEY=your_api_key_here

# Optional
TTS_VOICE=Orus          # Voice selection
NODE_ENV=development    # Environment
PORT=3000              # Server port
```

### Server Configuration

The Live server uses the same configuration as the regular server, but with enhanced WebSocket events:

- `start-conversation` - Start a new session
- `audio-chunk` - Send/receive audio chunks
- `text-input` - Send text for testing
- `stop-speaking` - End user speech
- `interrupt` - Interrupt AI response
- `end-conversation` - End session

## 🎯 API Endpoints

### HTTP Endpoints

- `GET /api/health` - Health check
- `GET /api/session` - Session information

### WebSocket Events

#### Client → Server
- `start-conversation` - Start new session
- `audio-chunk` - Send audio data
- `text-input` - Send text input
- `stop-speaking` - End user speech
- `interrupt` - Interrupt AI
- `end-conversation` - End session
- `test-text` - Test text input
- `health-check` - Check connection

#### Server → Client
- `session-status` - Session status
- `audio-chunk` - Receive audio chunks
- `text-response` - Receive text response
- `audio-complete` - Audio streaming complete
- `interruption` - Interruption notification
- `error` - Error messages
- `health-response` - Health check response

## 🔍 Monitoring

### Admin WebSocket Namespace

Connect to `/admin` for monitoring:

```javascript
const adminSocket = io('ws://localhost:3000/admin');

// Get all sessions
adminSocket.emit('get-all-sessions');

// Get service status
adminSocket.emit('get-service-status');

// Force cleanup
adminSocket.emit('force-cleanup');
```

### Logs

The server provides detailed logging:

- Connection events
- Audio processing
- API calls
- Errors and warnings

## 🚨 Troubleshooting

### Common Issues

#### 1. "Session not connected" Error

**Cause**: Gemini Live API connection failed
**Solution**: 
- Check your API key
- Verify internet connection
- Ensure API key has Live API access

#### 2. "No audio received" Error

**Cause**: Audio processing failed
**Solution**:
- Check audio format (should be WAV)
- Verify audio data is not empty
- Check network connectivity

#### 3. "API call timeout" Error

**Cause**: Gemini API is overloaded
**Solution**:
- Wait a few minutes and retry
- Check API status page
- Consider rate limiting

### Debug Mode

Enable debug logging by setting:

```env
LOG_LEVEL=debug
```

### Health Check

```bash
curl http://localhost:3000/api/health
```

## 🔄 Migration from Old Server

### 1. Stop the old server

```bash
# If running in terminal, press Ctrl+C
# Or kill the process
```

### 2. Start the Live server

```bash
npm run dev:live
```

### 3. Update frontend (if needed)

The WebSocket events are compatible, but you may want to add:

```javascript
// Listen for text responses
socket.on('text-response', (data) => {
  console.log('AI said:', data.text);
});

// Listen for audio completion
socket.on('audio-complete', (data) => {
  console.log('Audio streaming complete');
});
```

## 🎉 Success Indicators

You'll know it's working when:

1. ✅ Server starts without errors
2. ✅ Test script passes all checks
3. ✅ You hear **real human speech** (not tones)
4. ✅ Audio quality is high
5. ✅ Responses are natural and conversational

## 📞 Support

If you encounter issues:

1. Check the logs for error messages
2. Run the test script: `node test-gemini-live.js`
3. Verify your API key and permissions
4. Check the troubleshooting section above

## 🚀 Next Steps

Once the Live server is working:

1. **Test with your frontend** - Connect and try voice chat
2. **Customize voices** - Try different voice options
3. **Monitor performance** - Use the admin interface
4. **Scale up** - Add more features as needed

---

**🎯 You now have a production-ready voice assistant with real human speech!** 