# Render Deployment Guide

## ✅ Fixed Issues

### 1. **Port Binding Issue** - FIXED
**Problem**: Server was binding to `localhost` instead of `0.0.0.0`
**Solution**: Updated `src/config/environment.js` to bind to `0.0.0.0` in production

### 2. **Environment Detection** - FIXED
**Problem**: Render couldn't detect open ports
**Solution**: Added proper production environment handling

## Deployment Configuration

### Files Modified for Render

#### 1. `src/config/environment.js`
```javascript
server: {
  port: parseInt(process.env.PORT) || 3000,
  host: process.env.NODE_ENV === 'production' ? '0.0.0.0' : (process.env.HOST || 'localhost'),
  env: process.env.NODE_ENV || 'development',
},
```

#### 2. `src/server-live.js`
- Added production-specific startup messages
- Improved error handling for deployment

#### 3. `src/routes/healthRoutes.js`
- Added simple health check endpoint for Render
- Enhanced health monitoring

#### 4. `render.yaml` (NEW)
```yaml
services:
  - type: web
    name: sova-voice-interface
    env: node
    plan: starter
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
    healthCheckPath: /api/health
    autoDeploy: true
```

## Environment Variables for Render

### Required Environment Variables
Set these in your Render dashboard:

```env
NODE_ENV=production
PORT=10000
GEMINI_API_KEY=your_gemini_api_key
BACKUP_KEY=your_backup_key
BACKUP_KEY_ONE=your_backup_key_one
BACKUP_KEY_TWO=your_backup_key_two
```

### Optional Environment Variables
```env
TTS_VOICE=Orus
GEMINI_MODEL=gemini-2.0-flash-live-001
CORS_ORIGIN=*
WS_PING_TIMEOUT=60000
WS_PING_INTERVAL=25000
WS_MAX_PAYLOAD=10485760
```

## Deployment Steps

### 1. **Prepare Your Repository**
```bash
# Ensure all changes are committed
git add .
git commit -m "Configure for Render deployment"
git push origin main
```

### 2. **Connect to Render**
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Use the `render.yaml` configuration

### 3. **Set Environment Variables**
In your Render service settings:
1. Go to "Environment" tab
2. Add all required environment variables
3. Make sure `NODE_ENV=production` is set

### 4. **Deploy**
1. Render will automatically detect the `render.yaml` file
2. Build command: `npm install`
3. Start command: `npm start`
4. Health check path: `/api/health`

## Health Check Endpoints

### Simple Health Check
```bash
GET /api/health
```
Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-07-31T07:04:19.768Z",
  "uptime": 2.331890667,
  "environment": "production"
}
```

### Detailed Health Check
```bash
GET /api/health/detailed
```
Includes WebSocket statistics and system information.

## Testing Deployment

### 1. **Local Testing**
```bash
# Test production mode locally
NODE_ENV=production PORT=10000 node src/server-live.js

# Test health endpoint
curl http://localhost:10000/api/health
```

### 2. **Render Testing**
Once deployed, test your endpoints:
```bash
# Replace with your Render URL
curl https://your-app-name.onrender.com/api/health
```

## Troubleshooting

### Common Issues

#### 1. **Port Detection Issues**
If Render still can't detect ports:
- Ensure `NODE_ENV=production` is set
- Verify server binds to `0.0.0.0`
- Check logs for binding errors

#### 2. **Environment Variables**
If the app fails to start:
- Verify all required environment variables are set
- Check for typos in variable names
- Ensure API keys are valid

#### 3. **Health Check Failures**
If health checks fail:
- Verify `/api/health` endpoint returns 200
- Check application logs for errors
- Ensure server starts within timeout period

### Debug Commands

#### Check Server Status
```bash
# Local testing
curl http://localhost:10000/api/health

# Render testing
curl https://your-app-name.onrender.com/api/health
```

#### Check WebSocket
```bash
# Test WebSocket connection
wscat -c ws://your-app-name.onrender.com
```

## Production Features

### 1. **Rate Limiting**
- Maximum 5 connections per IP
- 1-minute rate limiting window
- Automatic cleanup every 5 minutes

### 2. **Health Monitoring**
- Real-time connection statistics
- Memory usage monitoring
- WebSocket status tracking

### 3. **Error Handling**
- Graceful shutdown procedures
- Connection cleanup
- Memory leak prevention

## Frontend Configuration

Update your frontend to connect to the Render URL:

```javascript
// Replace localhost with your Render URL
const socket = io('https://your-app-name.onrender.com', {
  auth: { userId: 'web-user' }
});
```

## Monitoring

### Render Dashboard
- Monitor deployment status
- View application logs
- Check environment variables

### Health Endpoints
- `/api/health` - Basic health check
- `/api/health/detailed` - Detailed statistics

### Logs
- Application logs in Render dashboard
- WebSocket connection logs
- Error tracking and debugging

## Success Indicators

✅ **Deployment Successful When:**
- Render shows "Live" status
- Health check endpoint returns 200
- WebSocket connections work
- No port detection errors
- Application logs show successful startup

## Next Steps

1. **Deploy to Render** using the configuration above
2. **Test all endpoints** to ensure functionality
3. **Update frontend** to use Render URL
4. **Monitor performance** and adjust as needed
5. **Set up monitoring** for production usage

Your server is now properly configured for Render deployment! 🚀 