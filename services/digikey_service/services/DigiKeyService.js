const axios = require('axios');
const { getCollection } = require('../config/db');
const { loggerInfo, loggerError, loggerSuccess, loggerWarn } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class DigiKeyService {
    constructor() {
        // DigiKey API configuration
        this.clientId = process.env.DIGIKEY_CLIENT_ID || 'ZT9LNhAQzYvQ9x06NlqtYGZoeRDdTsYEgK0JJDh0QlUs8Re4';
        this.clientSecret = process.env.DIGIKEY_CLIENT_SECRET || 'hQrLAiEuT73MvLmSjReuIGLvNdygRwb8E91P7UXYdK5CaUeyzYrFcKf6Gvvrjs25';
        this.baseURL = 'https://api.digikey.com/products/v4';
        this.tokenURL = 'https://api.digikey.com/v1/oauth2/token';
        this.searchURL = `${this.baseURL}/search/keyword`;

        // Cache for access token
        this.accessToken = null;
        this.tokenExpiry = null;

        // Cache for categories data
        this.categoriesCache = null;

        // MongoDB collection name
        this.collectionName = 'products';
    }

    /**
     * Fetch categories from DigiKey API with caching
     * @returns {Promise<Array>} Categories array
     */
    async fetchCategories() {
        if (this.categoriesCache) {
            loggerInfo('Using cached categories data');
            return this.categoriesCache;
        }
        try {
            const token = await this.getAccessToken();
            const url = `${this.baseURL}/search/categories`;

            loggerInfo(`Fetching categories from: ${url}`);
            loggerInfo(`Request headers: Authorization: Bearer ${token.substring(0, 10)}..., X-DIGIKEY-Client-Id: ${this.clientId.substring(0, 5)}...`);

            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-DIGIKEY-Client-Id': this.clientId,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            loggerInfo(`Categories request successful. Response status: ${response.status}`);

            if (response.status === 200 && response.data) {
                this.categoriesCache = response.data.Categories || [];
                loggerInfo('Fetched categories data from DigiKey API');
                return this.categoriesCache;
            } else {
                loggerWarn('Failed to fetch categories data from DigiKey API');
                return [];
            }
        } catch (error) {
            loggerError(`Error fetching categories: ${error.message}`);
            if (error.response) {
                loggerError(`Categories request failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            }
            return [];
        }
    }

    /**
     * Build a map of categories by CategoryId for quick lookup
     * @param {Array} categories - Categories array
     * @returns {Map} Map of CategoryId to category object with parent reference
     */
    buildCategoryMap(categories) {
        const map = new Map();
        function traverse(categoriesList, parent = null) {
            categoriesList.forEach(cat => {
                if (cat) {
                    map.set(cat.CategoryId, { ...cat, parent });
                    if (cat.Children && cat.Children.length > 0) {
                        traverse(cat.Children, cat);
                    }
                }
            });
        }
        traverse(categories);
        return map;
    }

    /**
     * Get full category hierarchy names array from categoryId
     * @param {number} categoryId - Category ID
     * @param {Map} categoryMap - Map of categories
     * @returns {Array} Array of category names from root to leaf
     */
    getCategoryHierarchy(categoryId, categoryMap) {
        const hierarchy = [];
        let current = categoryMap.get(categoryId);
        while (current) {
            hierarchy.unshift(current.Name);
            current = current.parent;
        }
        return hierarchy;
    }

    /**
     * Get OAuth 2.0 access token using client credentials flow
     * @returns {Promise<string>} Access token
     */
    async getAccessToken() {
        try {
            // Check if token is still valid
            if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
                loggerInfo('Using cached DigiKey access token');
                return this.accessToken;
            }

            if (!this.clientId || !this.clientSecret) {
                throw new Error('DigiKey API client ID or client secret is missing. Please set DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET environment variables.');
            }

            loggerInfo(`Requesting new DigiKey access token with Client ID: ${this.clientId.substring(0, 5)}...`);

            const tokenData = {
                grant_type: 'client_credentials',
                client_id: this.clientId,
                client_secret: this.clientSecret
            };

            loggerInfo(`Making token request to: ${this.tokenURL}`);

            const response = await axios.post(this.tokenURL, tokenData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000
            });

            loggerInfo(`Token request successful. Response status: ${response.status}`);

            this.accessToken = response.data.access_token;
            // Set expiry time (subtract 5 minutes for safety)
            this.tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;

            loggerSuccess('Successfully obtained DigiKey access token');
            return this.accessToken;

        } catch (error) {
            loggerError(`Failed to get DigiKey access token: ${error.message}`);
            if (error.response) {
                loggerError(`Token request failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            }

            // For development/testing purposes, we'll simulate a successful response
            loggerWarn('Using mock data for DigiKey API response');
            this.accessToken = 'mock_token_for_development';
            this.tokenExpiry = Date.now() + 3600000; // 1 hour
            return this.accessToken;
        }
    }

    /**
     * Search products using DigiKey API
     * @param {string} query - Search query
     * @returns {Promise<Array>} Array of products
     */
    async searchProducts(query) {
        try {
            const token = await this.getAccessToken();

            loggerInfo(`Searching DigiKey API for: "${query}"`);

            // Construct request body for POST request
            const requestBody = {
                Keywords: query,
                RecordCount: 50,
                Includes: ["Classifications", "PrimarySupplier", "ProductInfo"],
                // Optionally add FilterOptionsRequest and SortOptions here if needed
            };

            const searchURL = this.searchURL; // Use the v4 endpoint

            loggerInfo(`Making search request to: ${searchURL}`);
            loggerInfo(`Request headers: Authorization: Bearer ${token.substring(0, 10)}..., X-DIGIKEY-Client-Id: ${this.clientId.substring(0, 5)}...`);
            loggerInfo(`Request body: ${JSON.stringify(requestBody)}`);

            try {
                const response = await axios.post(searchURL, requestBody, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-DIGIKEY-Client-Id': this.clientId,
                        'Content-Type': 'application/json',
                        // Optionally add locale headers if needed
                    },
                    timeout: 15000
                });

                loggerInfo(`Search request successful. Response status: ${response.status}`);
                loggerInfo(`Response data keys: ${Object.keys(response.data)}`);

                const products = this.parseDigiKeyResponse(response.data, query);

                // Fetch categories to enrich subCategory data
                const categories = await this.fetchCategories();

                // Build category map
                const categoryMap = this.buildCategoryMap(categories);

                // Enrich products with categoryHierarchy and subCategory from categories map
                const enrichedProducts = products.map(product => {
                    let categoryHierarchy = [];

                    // Try to get hierarchy from categoryId
                    if (product.categoryId) {
                        categoryHierarchy = this.getCategoryHierarchy(product.categoryId, categoryMap);
                    }

                    // If no hierarchy found, try to build from Classifications
                    if (categoryHierarchy.length === 0 && product.classifications) {
                        const classifications = product.classifications;
                        const hierarchy = [];

                        if (classifications.Category) {
                            hierarchy.push(classifications.Category.Name);
                        }
                        if (classifications.Family) {
                            hierarchy.push(classifications.Family.Name);
                        }
                        if (classifications.SubFamily) {
                            hierarchy.push(classifications.SubFamily.Name);
                        }

                        categoryHierarchy = hierarchy.filter(Boolean);
                    }

                    // If still no hierarchy, use mainCategory
                    if (categoryHierarchy.length === 0 && product.mainCategory) {
                        categoryHierarchy = [product.mainCategory];
                    }

                    product.categoryHierarchy = categoryHierarchy;
                    return product;
                });

                loggerSuccess(`Found ${enrichedProducts.length} products from DigiKey API with enriched subCategory data`);
                return enrichedProducts;

            } catch (apiError) {
                if (apiError.response) {
                    loggerWarn(`DigiKey API call failed with status ${apiError.response.status}: ${JSON.stringify(apiError.response.data)}. Using mock data.`);
                } else {
                    loggerWarn(`DigiKey API call failed: ${apiError.message}. Using mock data.`);
                }
                return this.getMockProducts(query);
            }

        } catch (error) {
            loggerError(`Error in searchProducts: ${error.message}`);
            // Return mock data for development
            return this.getMockProducts(query);
        }
    }

    /**
     * Parse DigiKey API response to our format
     * @param {Object} apiResponse - DigiKey API response
     * @param {string} query - Original search query
     * @returns {Array} Parsed products array
     */
    parseDigiKeyResponse(apiResponse, query) {
        try {
            const products = [];

            if (apiResponse.Products && Array.isArray(apiResponse.Products)) {
                apiResponse.Products.forEach(product => {
                    if (product.Classifications) {
                        loggerInfo(`Product classifications for productId ${product.ProductId}: ${JSON.stringify(product.Classifications)}`);
                    } else {
                        loggerWarn(`No classifications found for productId ${product.ProductId}`);
                    }

                    const parsedProduct = {
                        productId: product.ProductId || product.ManufacturerPartNumber || `unknown_${Date.now()}`,
                        name: (product.Description && product.Description.ProductDescription) || product.ManufacturerPartNumber || 'Unknown Product',
                        description: (product.Description && product.Description.DetailedDescription) || (product.Description && product.Description.ProductDescription) || 'No description',
                        price: this.extractPrice(product.StandardPricing && product.StandardPricing[0]?.UnitPrice) || 0,
                        query: query,
                        createdAt: new Date(),
                        // Additional DigiKey specific fields
                        manufacturer: (product.Manufacturer && product.Manufacturer.Name) || 'Unknown',
                        manufacturerPartNumber: product.ManufacturerProductNumber || product.ManufacturerPartNumber || '',
                        digiKeyPartNumber: (product.ProductVariations && product.ProductVariations.length > 0 && product.ProductVariations[0].DigiKeyProductNumber) || product.DigiKeyProductNumber || '',
                        quantityAvailable: product.QuantityAvailable || 0,
                        mainCategory: (product.Classifications && product.Classifications.Category && product.Classifications.Category.Name) || (product.Category && product.Category.Name) || 'Uncategorized',
                        categoryId: (product.Classifications && product.Classifications.Category && product.Classifications.Category.CategoryId) || (product.Category && product.Category.CategoryId) || null,
                        productUrl: product.ProductUrl || '',
                        datasheetUrl: product.DatasheetUrl || '',
                        photoUrl: product.PhotoUrl || '',
                        productVariations: product.ProductVariations || [],
                        productStatus: product.ProductStatus || {},
                        backOrderNotAllowed: product.BackOrderNotAllowed || false,
                        normallyStocking: product.NormallyStocking || false,
                        discontinued: product.Discontinued || false,
                        endOfLife: product.EndOfLife || false,
                        ncnr: product.Ncnr || false,
                        primaryVideoUrl: product.PrimaryVideoUrl || '',
                        parameters: product.Parameters || [],
                        baseProductNumber: product.BaseProductNumber || {},
                        series: product.Series || {},
                        shippingInfo: product.ShippingInfo || '',
                        classifications: product.Classifications || {},
                        otherNames: product.OtherNames || []
                    };
                    products.push(parsedProduct);
                });
            }

            return products;
        } catch (error) {
            loggerError(`Error parsing DigiKey response: ${error.message}`);
            return [];
        }
    }

    /**
     * Extract price from DigiKey price format
     * @param {Object|Array} priceData - DigiKey price data
     * @returns {number} Price value
     */
    extractPrice(priceData) {
        try {
            if (Array.isArray(priceData) && priceData.length > 0) {
                return parseFloat(priceData[0].UnitPrice) || 0;
            }
            if (typeof priceData === 'object' && priceData.UnitPrice) {
                return parseFloat(priceData.UnitPrice) || 0;
            }
            if (typeof priceData === 'number') {
                return priceData;
            }
            return 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Generate mock products for development/testing
     * @param {string} query - Search query
     * @returns {Array} Mock products array
     */
    getMockProducts(query) {
        const mockProducts = [
            {
                productId: `mock_${query}_001`,
                name: `${query.charAt(0).toUpperCase() + query.slice(1)} - Premium Series`,
                description: `High-quality ${query} component with excellent specifications`,
                price: Math.round((Math.random() * 50 + 1) * 100) / 100,
                query: query,
                createdAt: new Date(),
                manufacturer: 'Mock Electronics',
                manufacturerPartNumber: `ME-${query.toUpperCase()}-001`,
                digiKeyPartNumber: `DK-${query.toUpperCase()}-001`,
                quantityAvailable: Math.floor(Math.random() * 1000) + 100,
                category: 'Electronic Components'
            },
            {
                productId: `mock_${query}_002`,
                name: `${query.charAt(0).toUpperCase() + query.slice(1)} - Standard Series`,
                description: `Standard ${query} component for general applications`,
                price: Math.round((Math.random() * 30 + 1) * 100) / 100,
                query: query,
                createdAt: new Date(),
                manufacturer: 'Standard Components Inc',
                manufacturerPartNumber: `SCI-${query.toUpperCase()}-002`,
                digiKeyPartNumber: `DK-${query.toUpperCase()}-002`,
                quantityAvailable: Math.floor(Math.random() * 500) + 50,
                category: 'Electronic Components'
            },
            {
                productId: `mock_${query}_003`,
                name: `${query.charAt(0).toUpperCase() + query.slice(1)} - Economy Series`,
                description: `Cost-effective ${query} component for budget applications`,
                price: Math.round((Math.random() * 15 + 1) * 100) / 100,
                query: query,
                createdAt: new Date(),
                manufacturer: 'Economy Electronics',
                manufacturerPartNumber: `EE-${query.toUpperCase()}-003`,
                digiKeyPartNumber: `DK-${query.toUpperCase()}-003`,
                quantityAvailable: Math.floor(Math.random() * 2000) + 200,
                category: 'Electronic Components'
            }
        ];

        loggerInfo(`Generated ${mockProducts.length} mock products for query: "${query}"`);
        return mockProducts;
    }

    /**
     * Get next incremental productId from the database
     * @returns {Promise<number>} next productId
     */
    async getNextProductId() {
        const collection = getCollection(this.collectionName);
        const maxProduct = await collection.find({})
            .sort({ productId: -1 })
            .limit(1)
            .toArray();

        if (maxProduct.length === 0) {
            return 1;
        }

        const maxId = parseInt(maxProduct[0].productId, 10);
        return isNaN(maxId) ? 1 : maxId + 1;
    }

    /**
     * Store products in MongoDB only if they don't already exist
     * @param {Array} products - Array of products to store
     * @returns {Promise<Object>} Operation result
     */
    async storeProducts(products) {
        try {
            if (!products || products.length === 0) {
                loggerWarn('No products to store');
                return { insertedCount: 0, skippedCount: 0 };
            }

            const collection = getCollection(this.collectionName);
            let insertedCount = 0;
            let skippedCount = 0;

            loggerInfo(`Storing ${products.length} products in MongoDB...`);

            // Use Promise.all for concurrent operations
            const operations = products.map(async (product) => {
                try {
                    // Assign UUID productId if missing or unknown
                    if (!product.productId || product.productId.startsWith('unknown_')) {
                        product.productId = uuidv4();
                    }

                    // Check if product already exists
                    const existingProduct = await collection.findOne({ productId: product.productId });

                    if (existingProduct) {
                        // Product already exists, skip it
                        skippedCount++;
                        loggerInfo(`Product ${product.productId} already exists, skipping...`);
                        return null;
                    }

                    // Product doesn't exist, insert it
                    const result = await collection.insertOne({
                        ...product,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });

                    insertedCount++;
                    loggerInfo(`Successfully inserted product ${product.productId}`);
                    return result;
                } catch (error) {
                    loggerError(`Error storing product ${product.productId}: ${error.message}`);
                    throw error;
                }
            });

            await Promise.all(operations);

            const result = { insertedCount, skippedCount };
            loggerSuccess(`Successfully stored products - Inserted: ${insertedCount}, Skipped: ${skippedCount}`);

            return result;

        } catch (error) {
            loggerError(`Error storing products in MongoDB: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get stored products from MongoDB
     * @param {string} query - Search query to filter products
     * @param {number} limit - Maximum number of products to return
     * @returns {Promise<Array>} Array of stored products
     */
    async getStoredProducts(query, limit = 50) {
        try {
            const collection = getCollection(this.collectionName);

            const filter = query ? {
                $or: [
                    { query: { $regex: query, $options: 'i' } },
                    { name: { $regex: query, $options: 'i' } },
                    { description: { $regex: query, $options: 'i' } }
                ]
            } : {};

            const products = await collection
                .find(filter)
                .sort({ createdAt: -1 })
                .limit(limit)
                .toArray();

            loggerInfo(`Retrieved ${products.length} products from MongoDB`);
            return products;

        } catch (error) {
            loggerError(`Error retrieving products from MongoDB: ${error.message}`);
            throw error;
        }
    }

    /**
     * Main method to search and store products
     * @param {string} query - Search query
     * @returns {Promise<Array>} Array of products
     */
    async searchAndStoreProducts(query) {
        try {
            loggerInfo(`Starting product search and store operation for: "${query}"`);

            // Search products from DigiKey API
            const products = await this.searchProducts(query);

            if (products.length > 0) {
                // Store products in MongoDB
                const storeResult = await this.storeProducts(products);
                loggerInfo(`Store operation result - Inserted: ${storeResult.insertedCount}, Skipped: ${storeResult.skippedCount}`);
            }

            loggerSuccess(`Completed search and store operation for: "${query}"`);
            return products;

        } catch (error) {
            loggerError(`Error in searchAndStoreProducts: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get product details by product number from DigiKey API and store in MongoDB
     * @param {string} productNumber - DigiKey product number
     * @returns {Promise<Object|null>} Product details object or null if not found
     */
    async getProductDetailsByNumber(productNumber) {
        try {
            const token = await this.getAccessToken();

            const url = `${this.baseURL}/search/${encodeURIComponent(productNumber)}/productdetails`;

            loggerInfo(`Fetching product details from DigiKey API for product number: ${productNumber}`);
            loggerInfo(`Making request to: ${url}`);
            loggerInfo(`Request headers: Authorization: Bearer ${token.substring(0, 10)}..., X-DIGIKEY-Client-Id: ${this.clientId.substring(0, 5)}...`);

            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-DIGIKEY-Client-Id': this.clientId,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            loggerInfo(`Product details request successful. Response status: ${response.status}`);

            const product = response.data.Product;

            if (!product) {
                loggerWarn(`No product details found for product number: ${productNumber}`);
                return null;
            }

            // Log entire product details for debugging
            loggerInfo(`Full product details for ${productNumber}: ${JSON.stringify(product)}`);

            // Store the product details in MongoDB
            const storeResult = await this.storeProducts([product]);
            loggerInfo(`Store operation result - Inserted: ${storeResult.insertedCount}, Skipped: ${storeResult.skippedCount}`);

            loggerSuccess(`Stored product details for product number: ${productNumber}`);

            return product;

        } catch (error) {
            loggerError(`Error fetching product details for ${productNumber}: ${error.message}`);
            if (error.response) {
                loggerError(`Product details request failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            }
            return null;
        }
    }
    /**
     * Get categories from DigiKey API
     * @returns {Promise<Object>} Categories response object
     */
    async getCategories() {
        try {
            const token = await this.getAccessToken();
            const url = `${this.baseURL}/search/categories`;

            loggerInfo(`Fetching categories from: ${url}`);
            loggerInfo(`Request headers: Authorization: Bearer ${token.substring(0, 10)}..., X-DIGIKEY-Client-Id: ${this.clientId.substring(0, 5)}...`);

            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-DIGIKEY-Client-Id': this.clientId,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            loggerInfo(`Categories request successful. Response status: ${response.status}`);

            return response.data;
        } catch (error) {
            loggerError(`Error fetching categories from DigiKey API: ${error.message}`);
            if (error.response) {
                loggerError(`Categories request failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Get manufacturers list from DigiKey API
     * @returns {Promise<Object>} Manufacturers response object
     */
    async getManufacturers() {
        try {
            const token = await this.getAccessToken();
            const url = `${this.baseURL}/search/manufacturers`;

            loggerInfo(`Fetching manufacturers from: ${url}`);
            loggerInfo(`Request headers: Authorization: Bearer ${token.substring(0, 10)}..., X-DIGIKEY-Client-Id: ${this.clientId.substring(0, 5)}...`);

            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-DIGIKEY-Client-Id': this.clientId,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            loggerInfo(`Manufacturers request successful. Response status: ${response.status}`);

            if (response.status === 200 && response.data) {
                loggerInfo('Fetched manufacturers data from DigiKey API');
                return response.data;
            } else {
                loggerWarn('Failed to fetch manufacturers data from DigiKey API');
                return { Manufacturers: [] };
            }
        } catch (error) {
            loggerError(`Error fetching manufacturers: ${error.message}`);
            if (error.response) {
                loggerError(`Manufacturers request failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            }
            return { Manufacturers: [] };
        }
    }
    /**
     * Store categories in MongoDB with deduplication
     * @param {Array} categories - Array of category objects
     * @returns {Promise<Object>} Result of insert operation
     */
    async storeCategories(categories) {
        if (!categories || categories.length === 0) {
            loggerWarn('No categories to store');
            return { insertedCount: 0, skippedCount: 0 };
        }
        try {
            const collection = getCollection('categories');
            let insertedCount = 0;
            let skippedCount = 0;

            for (const category of categories) {
                // Use CategoryId as unique identifier
                const existing = await collection.findOne({ CategoryId: category.CategoryId });
                if (existing) {
                    skippedCount++;
                    continue;
                }
                await collection.insertOne({
                    ...category,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                insertedCount++;
            }
            loggerSuccess(`Stored categories - Inserted: ${insertedCount}, Skipped: ${skippedCount}`);
            return { insertedCount, skippedCount };
        } catch (error) {
            loggerError(`Error storing categories: ${error.message}`);
            throw error;
        }
    }

    /**
     * Store manufacturers in MongoDB with deduplication
     * @param {Array} manufacturers - Array of manufacturer objects
     * @returns {Promise<Object>} Result of insert operation
     */
    async storeManufacturers(manufacturers) {
        if (!manufacturers || manufacturers.length === 0) {
            loggerWarn('No manufacturers to store');
            return { insertedCount: 0, skippedCount: 0 };
        }
        try {
            const collection = getCollection('manufacturers');
            let insertedCount = 0;
            let skippedCount = 0;

            for (const manufacturer of manufacturers) {
                // Use Id as unique identifier
                const existing = await collection.findOne({ Id: manufacturer.Id });
                if (existing) {
                    skippedCount++;
                    continue;
                }
                await collection.insertOne({
                    ...manufacturer,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                insertedCount++;
            }
            loggerSuccess(`Stored manufacturers - Inserted: ${insertedCount}, Skipped: ${skippedCount}`);
            return { insertedCount, skippedCount };
        } catch (error) {
            loggerError(`Error storing manufacturers: ${error.message}`);
            throw error;
        }
    }
}

module.exports = DigiKeyService;
