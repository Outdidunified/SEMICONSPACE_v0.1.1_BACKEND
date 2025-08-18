const DigiKeyService = require('../services/DigiKeyService');
const { loggerInfo, loggerError, loggerWarn } = require('../utils/logger');

class ProductController {
    constructor() {
        this.digiKeyService = new DigiKeyService();
    }

    /**
     * Search products endpoint
     * POST /api/search
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async searchProducts(req, res) {
        try {
            const startTime = Date.now();
            loggerInfo(`Received product search request from ${req.ip}`);

            // Validate request body exists
            if (!req.body || typeof req.body !== 'object') {
                loggerWarn('Search request has invalid or missing request body');
                return res.status(400).json({
                    success: false,
                    error: 'Invalid request body',
                    message: 'Request body must be valid JSON with a query parameter',
                    example: { query: "your search term" }
                });
            }

            // Validate request body
            const { query } = req.body;

            if (!query) {
                loggerWarn('Search request missing query parameter');
                return res.status(400).json({
                    success: false,
                    error: 'Query parameter is required',
                    message: 'Please provide a search query in the request body',
                    example: { query: "your search term" }
                });
            }

            if (typeof query !== 'string' || query.trim().length === 0) {
                loggerWarn('Invalid query parameter provided');
                return res.status(400).json({
                    success: false,
                    error: 'Invalid query parameter',
                    message: 'Query must be a non-empty string'
                });
            }

            const trimmedQuery = query.trim();
            loggerInfo(`Processing search request for query: "${trimmedQuery}"`);

            // Search and store products using DigiKey service
            const products = await this.digiKeyService.searchAndStoreProducts(trimmedQuery);

            const responseTime = Date.now() - startTime;
            loggerInfo(`Search request completed in ${responseTime}ms. Found ${products.length} products`);

            // Return successful response
            return res.status(200).json({
                success: true,
                query: trimmedQuery,
                products: products,
                count: products.length,
                timestamp: new Date().toISOString(),
                responseTime: `${responseTime}ms`
            });

        } catch (error) {
            loggerError(`Error in searchProducts controller: ${error.message}`);
            loggerError(`Stack trace: ${error.stack}`);

            // Return error response
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: 'An error occurred while searching for products',
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Get stored products endpoint
     * GET /api/products
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getStoredProducts(req, res) {
        try {
            const startTime = Date.now();
            loggerInfo(`Received get stored products request from ${req.ip}`);

            // Extract query parameters
            const { query, limit } = req.query;
            const parsedLimit = limit ? parseInt(limit, 10) : 50;

            // Validate limit parameter
            if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
                loggerWarn('Invalid limit parameter provided');
                return res.status(400).json({
                    success: false,
                    error: 'Invalid limit parameter',
                    message: 'Limit must be a number between 1 and 1000'
                });
            }

            loggerInfo(`Retrieving stored products with query: "${query || 'all'}", limit: ${parsedLimit}`);

            // Get stored products from database
            const products = await this.digiKeyService.getStoredProducts(query, parsedLimit);

            const responseTime = Date.now() - startTime;
            loggerInfo(`Get stored products request completed in ${responseTime}ms. Retrieved ${products.length} products`);

            // Return successful response
            return res.status(200).json({
                success: true,
                query: query || null,
                products: products,
                count: products.length,
                limit: parsedLimit,
                timestamp: new Date().toISOString(),
                responseTime: `${responseTime}ms`
            });

        } catch (error) {
            loggerError(`Error in getStoredProducts controller: ${error.message}`);
            loggerError(`Stack trace: ${error.stack}`);

            // Return error response
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: 'An error occurred while retrieving stored products',
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Health check endpoint
     * GET /api/health
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async healthCheck(req, res) {
        try {
            loggerInfo('Health check request received');

            // Test database connection
            let dbStatus = 'unknown';
            try {
                const { getCollection } = require('../config/db');
                const collection = getCollection('products');
                await collection.findOne({}, { limit: 1 });
                dbStatus = 'connected';
            } catch (dbError) {
                dbStatus = 'disconnected';
                loggerWarn(`Database health check failed: ${dbError.message}`);
            }

            // Basic health check response
            const healthStatus = {
                success: true,
                status: 'healthy',
                service: 'digikey_service',
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                environment: process.env.NODE_ENV || 'development',
                database: {
                    status: dbStatus,
                    collection: 'products'
                },
                endpoints: {
                    'POST /digikey/search/keyword': 'Search products',
                    'GET /digikey/products/:productNumber/productdetails': 'Get product details',
                    'GET /digikey/health': 'Health check',
                    'GET /digikey/stats': 'Statistics',
                    'GET /digikey/products/v4/search/categories': 'Categories'
                }
            };

            return res.status(200).json(healthStatus);

        } catch (error) {
            loggerError(`Error in health check: ${error.message}`);

            return res.status(500).json({
                success: false,
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Get product statistics endpoint
     * GET /api/stats
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getProductStats(req, res) {
        try {
            loggerInfo('Product statistics request received');

            const collection = require('../config/db').getCollection('products');

            // Get basic statistics
            const totalProducts = await collection.countDocuments();
            const recentProducts = await collection.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
            });

            // Get top queries
            const topQueries = await collection.aggregate([
                { $group: { _id: '$query', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]).toArray();

            const stats = {
                success: true,
                totalProducts,
                recentProducts,
                topQueries: topQueries.map(item => ({
                    query: item._id,
                    count: item.count
                })),
                timestamp: new Date().toISOString()
            };

            loggerInfo(`Product statistics retrieved: ${totalProducts} total products`);
            return res.status(200).json(stats);

        } catch (error) {
            loggerError(`Error getting product statistics: ${error.message}`);

            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: 'An error occurred while retrieving product statistics',
                timestamp: new Date().toISOString()
            });
        }
    }
    /**
     * Get product details by product number
     * GET /api/products/:productNumber
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getProductDetailsByNumber(req, res) {
        try {
            const productNumber = req.params.productNumber;
            if (!productNumber) {
                return res.status(400).json({
                    success: false,
                    error: 'Product number is required',
                    message: 'Please provide a product number in the URL path'
                });
            }

            loggerInfo(`Fetching product details for product number: ${productNumber}`);

            // Fetch product details from DigiKey API and store in DB
            const productDetails = await this.digiKeyService.getProductDetailsByNumber(productNumber);

            if (!productDetails) {
                return res.status(404).json({
                    success: false,
                    error: 'Product not found',
                    message: `No product details found for product number: ${productNumber}`
                });
            }

            // Fetch categories and build map
            const categories = await this.digiKeyService.fetchCategories();
            const categoryMap = this.digiKeyService.buildCategoryMap(categories);

            // Determine leaf categoryId for hierarchy
            let leafCategoryId = productDetails.Category?.CategoryId;

            if (productDetails.Category?.Children && productDetails.Category.Children.length > 0) {
                // Use first child category as leaf category
                leafCategoryId = productDetails.Category.Children[0].CategoryId;
            }

            // Get category hierarchy for product using leaf categoryId
            const categoryHierarchy = this.digiKeyService.getCategoryHierarchy(leafCategoryId, categoryMap);

            // Add categoryHierarchy to productDetails
            productDetails.categoryHierarchy = categoryHierarchy;

            return res.status(200).json({
                success: true,
                product: productDetails,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            loggerError(`Error in getProductDetailsByNumber controller: ${error.message}`);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: 'An error occurred while fetching product details',
                timestamp: new Date().toISOString()
            });
        }
    }
    /**
     * Get categories endpoint
     * GET /api/products/v4/search/categories
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getCategories(req, res) {
        try {
            loggerInfo('Categories request received');

            const categoriesData = await this.digiKeyService.getCategories();

            // Store categories in database with deduplication
            if (categoriesData.Categories && categoriesData.Categories.length > 0) {
                await this.digiKeyService.storeCategories(categoriesData.Categories);
            }

            loggerInfo(`Successfully retrieved and stored ${categoriesData.Categories?.length || 0} categories`);

            return res.status(200).json(categoriesData);

        } catch (error) {
            loggerError(`Error fetching categories: ${error.message}`);

            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: 'An error occurred while fetching categories',
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Get manufacturers list from DigiKey API
     * GET /api/products/v4/search/manufacturers
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getManufacturers(req, res) {
        try {
            loggerInfo('Manufacturers list request received');

            const manufacturersData = await this.digiKeyService.getManufacturers();

            // Store manufacturers in database with deduplication
            if (manufacturersData.Manufacturers && manufacturersData.Manufacturers.length > 0) {
                await this.digiKeyService.storeManufacturers(manufacturersData.Manufacturers);
            }

            loggerInfo(`Successfully retrieved and stored ${manufacturersData.Manufacturers?.length || 0} manufacturers`);

            return res.status(200).json(manufacturersData);

        } catch (error) {
            loggerError(`Error fetching manufacturers: ${error.message}`);

            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: 'An error occurred while fetching manufacturers',
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = ProductController;
