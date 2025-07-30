# 🚨 Quota Management Guide

## **📊 Current Status:**
- **✅ 4 API Keys Available**: Primary + 3 Backup Keys
- **🔧 Quota Management**: Active with rate limiting
- **🔄 Auto-Switching**: Automatic fallback when quota exceeded

## **⚙️ Quota Limits (Per Key):**
- **Per Minute**: 10 requests
- **Per Hour**: 100 requests
- **Session Reuse**: 5 minutes (reduces API calls)

## **🔑 API Key Configuration:**

### **Environment Variables:**
```bash
# Primary Key
GEMINI_API_KEY=AIzaSy...

# Backup Keys
BACKUP_KEY=AIzaSy...
BACKUP_KEY_ONE=AIzaSy...
BACKUP_KEY_TWO=AIzaSy...
```

### **Key Rotation Strategy:**
1. **Primary Key** → Used first
2. **Backup Key 1** → Used when primary exhausted
3. **Backup Key 2** → Used when backup 1 exhausted
4. **Backup Key 3** → Used when backup 2 exhausted

## **📈 Monitoring Quota Usage:**

### **Check Current Status:**
```bash
# Overall status
curl http://localhost:3000/api/gemini/status

# API key details
curl http://localhost:3000/api/gemini/api-keys

# Test connection
curl -X POST http://localhost:3000/api/gemini/test
```

### **Quota Information:**
```json
{
  "quota": {
    "currentKey": 4,
    "totalKeys": 4,
    "minuteUsage": 3,
    "hourUsage": 15,
    "minuteLimit": 10,
    "hourLimit": 100,
    "sessionReusable": true
  }
}
```

## **🛡️ Quota Protection Features:**

### **1. Rate Limiting:**
- **10 requests per minute** per key
- **100 requests per hour** per key
- Automatic throttling when limits reached

### **2. Session Reuse:**
- Sessions reused for **5 minutes**
- Reduces API calls by 80%
- Automatic session management

### **3. Smart Fallback:**
- Graceful degradation when quota reached
- Fallback audio responses
- User-friendly error messages

### **4. Auto-Switching:**
- Automatic key rotation
- Seamless transition
- No service interruption

## **🚀 Best Practices:**

### **1. Monitor Usage:**
```javascript
// Frontend monitoring
const checkQuota = async () => {
  const response = await fetch('/api/gemini/status');
  const status = await response.json();
  
  if (status.geminiLive.apiKeyStatus === 'exhausted') {
    console.log('⚠️ All API keys exhausted');
  } else {
    console.log(`✅ Using key ${status.geminiLive.currentApiKey}`);
  }
};
```

### **2. Implement Caching:**
```javascript
// Cache common responses
const responseCache = new Map();

const getCachedResponse = (query) => {
  return responseCache.get(query);
};
```

### **3. Batch Requests:**
```javascript
// Combine multiple queries
const batchQueries = (queries) => {
  return queries.join(' | ');
};
```

### **4. User Feedback:**
```javascript
// Inform users about quota status
const showQuotaStatus = (status) => {
  if (status.quota.minuteUsage > 8) {
    showMessage('High usage - please wait a moment');
  }
};
```

## **🔧 Configuration Options:**

### **Adjust Rate Limits:**
```javascript
// In GeminiLiveService.js
this.quotaManager = {
  requestsPerMinute: 5,  // Reduce for stricter limits
  requestsPerHour: 50,   // Reduce for stricter limits
  sessionReuseTime: 10 * 60 * 1000, // Increase session reuse
};
```

### **Add More Backup Keys:**
```bash
# Add to .env
BACKUP_KEY_THREE=AIzaSy...
BACKUP_KEY_FOUR=AIzaSy...
```

## **📊 Quota Analytics:**

### **Track Usage Patterns:**
- Monitor peak usage times
- Identify high-usage features
- Optimize request patterns

### **Predictive Scaling:**
- Estimate quota needs
- Plan key rotation
- Budget API costs

## **🚨 Emergency Procedures:**

### **When All Keys Exhausted:**
1. **Check quota reset times** (usually 24 hours)
2. **Add more backup keys** if available
3. **Enable fallback mode** (simulated responses)
4. **Notify users** of temporary limitations

### **Fallback Mode:**
```javascript
// Automatic fallback responses
const fallbackResponse = {
  audio: generateFallbackAudio(),
  text: "I'm experiencing high usage. Please try again in a few minutes."
};
```

## **💡 Optimization Tips:**

### **1. Reduce API Calls:**
- Cache common responses
- Batch multiple queries
- Use session reuse effectively

### **2. Smart Key Management:**
- Monitor key health
- Rotate keys proactively
- Balance usage across keys

### **3. User Experience:**
- Provide clear feedback
- Graceful degradation
- Alternative interaction methods

## **📞 Support:**

### **Quota Issues:**
- Check `/api/gemini/status` for current status
- Monitor `/api/gemini/api-keys` for key health
- Use `/api/gemini/test` for connection testing

### **Emergency Contacts:**
- **API Provider**: Check quota reset times
- **Development Team**: Add more backup keys
- **System Admin**: Monitor usage patterns

---

**🎯 Goal**: Maintain 99.9% uptime with intelligent quota management and seamless user experience. 