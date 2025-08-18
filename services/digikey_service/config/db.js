const { MongoClient } = require('mongodb');
const { loggerInfo, loggerError } = require('../utils/logger');

// MongoDB connection configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://zdart2026:ibzPcNPmJ71uFhnw@cluster0.dryjxuy.mongodb.net/';
const DB_NAME = 'digikey_service';

let client = null;
let db = null;

/**
 * Connect to MongoDB database
 * @returns {Promise<Object>} Database connection object
 */
async function connectToDatabase() {
    try {
        if (db) {
            return db;
        }

        loggerInfo('Connecting to MongoDB...');

        client = new MongoClient(MONGODB_URI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        await client.connect();
        db = client.db(DB_NAME);

        // Test the connection
        await db.admin().ping();

        loggerInfo(`Successfully connected to MongoDB database: ${DB_NAME}`);
        return db;
    } catch (error) {
        loggerError(`Failed to connect to MongoDB: ${error.message}`);
        throw error;
    }
}

/**
 * Get database instance
 * @returns {Object} Database instance
 */
function getDatabase() {
    if (!db) {
        throw new Error('Database not connected. Call connectToDatabase() first.');
    }
    return db;
}

/**
 * Get specific collection
 * @param {string} collectionName - Name of the collection
 * @returns {Object} Collection instance
 */
function getCollection(collectionName) {
    const database = getDatabase();
    return database.collection(collectionName);
}

/**
 * Close database connection
 */
async function closeDatabaseConnection() {
    try {
        if (client) {
            await client.close();
            client = null;
            db = null;
            loggerInfo('MongoDB connection closed');
        }
    } catch (error) {
        loggerError(`Error closing MongoDB connection: ${error.message}`);
        throw error;
    }
}

// Handle process termination
process.on('SIGINT', async () => {
    await closeDatabaseConnection();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await closeDatabaseConnection();
    process.exit(0);
});

module.exports = {
    connectToDatabase,
    getDatabase,
    getCollection,
    closeDatabaseConnection
};
