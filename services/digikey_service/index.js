require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectToDatabase } = require('./config/db');
const productRoutes = require('./routes/productRoutes');
const { loggerInfo, loggerError, loggerSuccess, loggerWarn } = require('./utils/logger');

// Create Express application
const app = express();
const PORT = process.env.PORT || 8009;

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://172.232.110.10:8000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));



// JSON parsing middleware with error handling
app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf, encoding) => {
        // Store raw body for debugging if needed
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// JSON parsing error handler middleware
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        loggerError(`JSON parsing error from ${req.ip}: ${error.message}`);
        loggerError(`Request URL: ${req.method} ${req.originalUrl}`);
        loggerError(`Content-Type: ${req.get('Content-Type')}`);
        loggerError(`Content-Length: ${req.get('Content-Length')}`);

        // Log raw body if available for debugging
        if (req.rawBody) {
            loggerError(`Raw body (first 200 chars): ${req.rawBody.toString().substring(0, 200)}`);
        }

        // Special handling for GET requests with bodies
        if (req.method === 'GET') {
            loggerWarn(`GET request should not have a request body: ${req.method} ${req.originalUrl}`);
            return res.status(400).json({
                success: false,
                error: 'Invalid request',
                message: 'GET requests should not include a request body.',
                details: 'Remove the request body or use a different HTTP method (POST, PUT, etc.)',
                timestamp: new Date().toISOString()
            });
        }

        return res.status(400).json({
            success: false,
            error: 'Invalid JSON',
            message: 'The request body contains invalid JSON. Please check your JSON syntax.',
            details: 'Common issues: missing quotes, trailing commas, or incomplete JSON structure',
            timestamp: new Date().toISOString()
        });
    }
    next(error);
});

// Request logging middleware
app.use((req, res, next) => {
    const startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logMessage = `${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms - ${req.ip}`;

        if (res.statusCode >= 400) {
            loggerError(logMessage);
        } else {
            loggerInfo(logMessage);
        }
    });

    next();
});

// Routes
app.use('/digikey', productRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'DigiKey Service is running',
        service: 'digikey_service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            'GET /': 'Service information',
            'GET /api': 'API information',
            'POST /api/search': 'Search products',
            'GET /api/products': 'Get stored products',
            'GET /api/health': 'Health check',
            'GET /api/stats': 'Product statistics'
        }
    });
});

// 404 handler
app.use('*', (req, res) => {
    loggerError(`404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        error: 'Route not found',
        message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`,
        timestamp: new Date().toISOString()
    });
});

// Global error handler
app.use((error, req, res, next) => {
    loggerError(`Global error handler: ${error.message}`);
    loggerError(`Error type: ${error.constructor.name}`);
    loggerError(`Request: ${req.method} ${req.originalUrl}`);
    loggerError(`Stack trace: ${error.stack}`);

    // Handle different types of errors
    let statusCode = 500;
    let errorMessage = 'An unexpected error occurred';
    let errorType = 'Internal server error';

    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        // JSON parsing error (should be caught by earlier middleware, but just in case)
        statusCode = 400;
        errorType = 'JSON parsing error';
        errorMessage = 'Invalid JSON in request body';
    } else if (error.name === 'ValidationError') {
        // Validation errors
        statusCode = 400;
        errorType = 'Validation error';
        errorMessage = error.message;
    } else if (error.name === 'CastError') {
        // Database casting errors
        statusCode = 400;
        errorType = 'Invalid data format';
        errorMessage = 'Invalid data format provided';
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        // Network/connection errors
        statusCode = 503;
        errorType = 'Service unavailable';
        errorMessage = 'External service temporarily unavailable';
    }

    res.status(statusCode).json({
        success: false,
        error: errorType,
        message: errorMessage,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && {
            details: error.message,
            stack: error.stack
        })
    });
});

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
    loggerInfo(`Received ${signal}. Starting graceful shutdown...`);

    global.server.close(() => {
        loggerInfo('HTTP server closed');

        // Close database connection
        const { closeDatabaseConnection } = require('./config/db');
        closeDatabaseConnection()
            .then(() => {
                loggerInfo('Database connection closed');
                process.exit(0);
            })
            .catch((error) => {
                loggerError(`Error closing database connection: ${error.message}`);
                process.exit(1);
            });
    });

    // Force close after 10 seconds
    setTimeout(() => {
        loggerError('Forcing shutdown after timeout');
        process.exit(1);
    }, 10000);
};

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    loggerError(`Uncaught Exception: ${error.message}`);
    loggerError(`Stack trace: ${error.stack}`);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    loggerError(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    process.exit(1);
});

// Start server
async function startServer() {
    try {
        // Connect to MongoDB
        loggerInfo('Starting DigiKey Service...');
        await connectToDatabase();

        const os = require('os');
        // Start HTTP server
        const server = app.listen(PORT, () => {
            // Get local network IP address
            const interfaces = os.networkInterfaces();
            let localIp = 'localhost';
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        localIp = iface.address;
                        break;
                    }
                }
                if (localIp !== 'localhost') break;
            }

            loggerSuccess(`DigiKey Service is running on http://${localIp}:${PORT}`);
            loggerInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);
            loggerInfo(`Process ID: ${process.pid}`);
            loggerInfo('Service is ready to accept requests');
        });

        // Make server available for graceful shutdown
        global.server = server;

        return server;

    } catch (error) {
        loggerError(`Failed to start server: ${error.message}`);
        loggerError(`Stack trace: ${error.stack}`);
        process.exit(1);
    }
}

// Start the server
if (require.main === module) {
    startServer();
}

module.exports = app;