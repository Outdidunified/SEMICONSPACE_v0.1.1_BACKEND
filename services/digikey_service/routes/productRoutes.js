const express = require('express');
const ProductController = require('../controllers/ProductController');
const { loggerInfo } = require('../utils/logger');

const router = express.Router();
const productController = new ProductController();

// Middleware to log all API requests
router.use((req, res, next) => {
    loggerInfo(`${req.method} ${req.originalUrl} - ${req.ip}`);
    next();
});

/**
 * POST /api/search
 * Search products using DigiKey API and store in MongoDB
 * Body: { "query": "search_term" }
 */
router.post('/search/keyword', (req, res, next) => {
    // Additional validation for POST requests
    if (req.method === 'POST') {
        const contentType = req.get('Content-Type');
        const contentLength = req.get('Content-Length');

        loggerInfo(`POST request - Content-Type: ${contentType}, Content-Length: ${contentLength}`);

        // Check if content-type is application/json
        if (contentType && !contentType.includes('application/json')) {
            loggerWarn(`Invalid Content-Type for POST request: ${contentType}`);
            return res.status(400).json({
                success: false,
                error: 'Invalid Content-Type',
                message: 'Content-Type must be application/json for POST requests',
                received: contentType
            });
        }

        // Check if content-length is 0 or missing
        if (!contentLength || contentLength === '0') {
            loggerWarn('POST request with empty body');
            return res.status(400).json({
                success: false,
                error: 'Empty request body',
                message: 'POST request must include a JSON body with query parameter',
                example: { query: "your search term" }
            });
        }
    }
    next();
}, async (req, res) => {
    await productController.searchProducts(req, res);
});

/**
 * GET /api/products/:productNumber
 * Get product details from DigiKey API by product number and store in MongoDB
 */
router.get('/products/:productNumber(*)/productdetails', async (req, res) => {
    await productController.getProductDetailsByNumber(req, res);
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
    await productController.healthCheck(req, res);
});

/**
 * GET /api/stats
 * Get product statistics
 */
router.get('/stats', async (req, res) => {
    await productController.getProductStats(req, res);
});

/**
 * GET /api/
 * API information endpoint
 */
router.get('/', (req, res) => {
    res.json({
        success: true,
        service: 'DigiKey Service API',
        version: '1.0.0',
        description: 'Microservice for integrating with DigiKey API and managing product data',
        endpoints: {
            'POST /api/search': 'Search products using DigiKey API',
            'GET /api/products/:productNumber/productdetails': 'Get product details from DigiKey API by product number',
            'GET /api/health': 'Health check endpoint',
            'GET /api/stats': 'Get product statistics',
            'GET /api/products/v4/search/categories': 'Get product categories from DigiKey API',
            'GET /api/': 'API information'
        },
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /api/products/v4/search/categories
 * Get categories endpoint returning static response
 */
router.get('/categories', async (req, res) => {
    await productController.getCategories(req, res);
});

/**
 * GET /api/products/v4/search/manufacturers
 * Get manufacturers list from DigiKey API
 */
router.get('/manufacturers', async (req, res) => {
    await productController.getManufacturers(req, res);
});

module.exports = router;
