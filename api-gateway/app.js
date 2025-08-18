require('dotenv').config();
const express = require('express');
const cors = require('cors'); // ✅ CORS package imported
const { verifyJwt } = require('./middlewares/auth_middleware');
const { loggerInfo, loggerError, loggerWarn, loggerDebug, loggerSuccess } = require('./utils/logger');
const { createServiceProxy } = require('./utils/proxy');
const { formatISTDate } = require('./utils/time_formater');
const { sessionManager } = require('./utils/session_manager');
const serviceMap = require('./routes/service_map');

const app = express();
const PORT = process.env.PORT || 8000;

// ✅ Middleware
app.use(express.json());

// ✅ Enable CORS globally
app.use(cors({
  origin: '*', // Change this to specific domains in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Request logging
app.use((req, res, next) => {
  loggerInfo(`${req.method} ${req.originalUrl}`);
  next();
});

// ✅ Health check endpoint with service status
app.get('/health', async (req, res) => {
  const services = await Promise.all(
    Object.entries(serviceMap).map(async ([path, config]) => {
      try {
        const response = await fetch(`${config.target}/health`, { method: 'GET', timeout: 2000 });
        return {
          path,
          url: config.target,
          protected: config.protected,
          status: response.ok ? 'UP' : 'DOWN',
        };
      } catch (error) {
        loggerError(`Health check failed for ${path} (${config.target}): ${error.message}`);
        return { path, url: config.target, protected: config.protected, status: 'DOWN' };
      }
    })
  );

  loggerSuccess('Health check completed successfully');
  res.status(200).json({
    status: 'UP',
    timestamp: formatISTDate(new Date()),
    version: require('./package.json').version,
    services,
  });
});

// ✅ Session management endpoints
app.post('/api/session/register', (req, res) => {
  const { userId, sessionId, token } = req.body;

  if (!userId || !sessionId || !token) {
    return res.status(400).json({ error: 'Missing required fields: userId, sessionId, token' });
  }

  try {
    sessionManager.registerSession(userId, sessionId, token);
    loggerInfo(`Session registered successfully for user: ${userId}`);
    res.status(200).json({ message: 'Session registered successfully' });
  } catch (error) {
    loggerError(`Failed to register session: ${error.message}`);
    res.status(500).json({ error: 'Failed to register session' });
  }
});

app.get('/api/session/stats', (req, res) => {
  try {
    const stats = sessionManager.getStats();
    res.status(200).json(stats);
  } catch (error) {
    loggerError(`Failed to get session stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to get session stats' });
  }
});

app.delete('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  try {
    sessionManager.invalidateSession(sessionId);
    loggerInfo(`Session invalidated: ${sessionId}`);
    res.status(200).json({ message: 'Session invalidated successfully' });
  } catch (error) {
    loggerError(`Failed to invalidate session: ${error.message}`);
    res.status(500).json({ error: 'Failed to invalidate session' });
  }
});

// ✅ Proxy handler
app.use('/api', (req, res, next) => {
  const path = req.originalUrl.replace('/api', '');
  loggerDebug(`Processing path: ${path}`);

  const matches = Object.keys(serviceMap)
    .filter((prefix) => path.startsWith(prefix))
    .sort((a, b) => b.length - a.length);

  const match = matches[0];
  loggerDebug(`Matched service: ${match || 'none'}`);

  if (!match) {
    loggerWarn(`No service found for path: ${path}`);
    return res.status(502).json({ error: 'Unknown API path', path });
  }

  const { target, protected: isProtected } = serviceMap[match];
  const proxy = createServiceProxy(target, match, req.headers['authorization']);

  // Check if the route is protected - if not, skip JWT verification
  if (!isProtected) {
    loggerDebug(`Route ${match} is not protected, skipping JWT verification`);
    return proxy(req, res, next);
  } else {
    loggerDebug(`Route ${match} is protected, applying JWT verification`);
    return verifyJwt(req, res, () => proxy(req, res, next));
  }
});

// 404 fallback
app.use((req, res) => {
  loggerWarn(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

// Error handler
app.use((err, req, res, next) => {
  loggerError(`Error: ${err.message}`);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    status: err.status || 500,
  });
});

// ✅ Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  loggerInfo(`🛡️ API Gateway running on http://0.0.0.0:${PORT}`);
  loggerInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// ✅ Graceful shutdown
process.on('SIGTERM', () => {
  loggerInfo('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    loggerInfo('HTTP server closed');
    process.exit(0);
  });
});
