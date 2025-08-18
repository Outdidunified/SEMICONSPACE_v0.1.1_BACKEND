# DigiKey Service

A Node.js microservice that integrates with the DigiKey API to fetch product data, store it in MongoDB, and provide it to Backend-for-Frontend (BFF) services.

## Features

- **DigiKey API Integration**: OAuth 2.0 client credentials flow authentication
- **MongoDB Storage**: Direct MongoDB operations using the native driver (no Mongoose)
- **MVC Architecture**: Clean separation of concerns with controllers, services, and routes
- **Product Search**: Search products and store them with upsert operations
- **RESTful API**: Well-structured endpoints for product operations
- **Error Handling**: Comprehensive error handling and logging
- **Health Monitoring**: Health check and statistics endpoints

## Tech Stack

- **Node.js** with Express.js (v4.18.2)
- **MongoDB** driver (v6.16.0)
- **Axios** (v1.4.0) for HTTP requests
- **CORS** (v2.8.5) for cross-origin requests
- **Winston** for logging
- **dotenv** for environment configuration

## Project Structure

```
digikey_service/
├── config/
│   └── db.js                 # MongoDB connection configuration
├── services/
│   └── DigiKeyService.js     # Business logic for DigiKey API and MongoDB
├── controllers/
│   └── ProductController.js  # HTTP request handlers
├── routes/
│   └── productRoutes.js      # API route definitions
├── utils/
│   └── logger.js            # Logging utilities
├── index.js                 # Main server file
├── package.json             # Dependencies and scripts
├── .env.example            # Environment variables template
└── README.md               # This file
```

## Installation

1. **Clone the repository** (if applicable) or ensure you're in the project directory:
   ```bash
   cd digikey_service
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```
   
   Edit the `.env` file with your configuration:
   ```env
   PORT=4000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/digikey_db
   DIGIKEY_CLIENT_ID=ZT9LNhAQzYvQ9x06NlqtYGZoeRDdTsYEgK0JJDh0QlUs8Re4
   DIGIKEY_CLIENT_SECRET=hQrLAiEuT73MvLmSjReuIGLvNdygRwb8E91P7UXYdK5CaUeyzYrFcKf6Gvvrjs25
   CORS_ORIGIN=http://localhost:3000,http://localhost:3001
   ```

4. **Ensure MongoDB is running**:
   - Install MongoDB locally or use MongoDB Atlas
   - Default connection: `mongodb://localhost:27017/digikey_db`

## Usage

### Start the Service

```bash
# Production mode
npm start

# Development mode (with nodemon)
npm run dev
```

The service will start on `http://localhost:4000`

### API Endpoints

#### 1. Search Products
**POST** `/api/search`

Search for products using the DigiKey API and store them in MongoDB.

```bash
curl -X POST http://localhost:4000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "resistor"}'
```

**Response:**
```json
{
  "success": true,
  "query": "resistor",
  "products": [
    {
      "productId": "mock_resistor_001",
      "name": "Resistor - Premium Series",
      "description": "High-quality resistor component with excellent specifications",
      "price": 12.45,
      "query": "resistor",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "manufacturer": "Mock Electronics",
      "manufacturerPartNumber": "ME-RESISTOR-001",
      "digiKeyPartNumber": "DK-RESISTOR-001",
      "quantityAvailable": 850,
      "category": "Electronic Components"
    }
  ],
  "count": 3,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "responseTime": "245ms"
}
```

#### 2. Get Stored Products
**GET** `/api/products?query=resistor&limit=10`

Retrieve stored products from MongoDB.

```bash
curl "http://localhost:4000/api/products?query=resistor&limit=10"
```

#### 3. Health Check
**GET** `/api/health`

Check service health status.

```bash
curl http://localhost:4000/api/health
```

#### 4. Product Statistics
**GET** `/api/stats`

Get product statistics and top queries.

```bash
curl http://localhost:4000/api/stats
```

#### 5. API Information
**GET** `/api/`

Get API information and available endpoints.

```bash
curl http://localhost:4000/api/
```

## Database Schema

Products are stored in the `products` collection with the following structure:

```javascript
{
  productId: String,           // Unique identifier (used for upsert)
  name: String,               // Product name
  description: String,        // Product description (default: "No description")
  price: Number,              // Product price (default: 0)
  query: String,              // Original search query
  createdAt: Date,            // Creation timestamp
  updatedAt: Date,            // Last update timestamp
  manufacturer: String,       // Manufacturer name
  manufacturerPartNumber: String,
  digiKeyPartNumber: String,
  quantityAvailable: Number,
  category: String
}
```

## DigiKey API Integration

The service implements OAuth 2.0 client credentials flow for DigiKey API authentication:

1. **Token Request**: Automatically requests access tokens using client credentials
2. **Token Caching**: Caches tokens and refreshes them before expiry
3. **API Calls**: Makes authenticated requests to DigiKey's product search endpoint
4. **Fallback**: Uses mock data when API is unavailable (for development)

### DigiKey Credentials

The service is configured with the provided DigiKey credentials:
- **Client ID**: `ZT9LNhAQzYvQ9x06NlqtYGZoeRDdTsYEgK0JJDh0QlUs8Re4`
- **Client Secret**: `hQrLAiEuT73MvLmSjReuIGLvNdygRwb8E91P7UXYdK5CaUeyzYrFcKf6Gvvrjs25`

## Error Handling

The service includes comprehensive error handling:

- **Validation Errors**: 400 status for missing or invalid parameters
- **API Errors**: Graceful fallback to mock data when DigiKey API is unavailable
- **Database Errors**: Proper error logging and 500 status responses
- **Global Error Handler**: Catches unhandled errors and provides consistent responses

## Logging

The service uses Winston for structured logging:

- **Console Output**: Colored logs for different levels
- **File Output**: Logs stored in `Log/ChargerLog.log`
- **Log Levels**: error, warn, info, success, debug, pingpong

## Development Notes

### Mock Data
When the DigiKey API is unavailable, the service automatically falls back to mock data to ensure continuous development and testing.

### Database Operations
- Uses MongoDB native driver (not Mongoose)
- Implements upsert operations for product storage
- Direct collection operations for flexibility

### Security Considerations
- Environment variables for sensitive configuration
- CORS configuration for cross-origin requests
- Input validation and sanitization
- Proper error handling without exposing internal details

## Testing

Test the service endpoints using curl, Postman, or any HTTP client:

```bash
# Test health endpoint
curl http://localhost:4000/api/health

# Test search functionality
curl -X POST http://localhost:4000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "capacitor"}'

# Test getting stored products
curl "http://localhost:4000/api/products?limit=5"
```

## Deployment

For production deployment:

1. Set `NODE_ENV=production` in your environment
2. Configure production MongoDB connection
3. Set up proper logging and monitoring
4. Use a process manager like PM2
5. Configure reverse proxy (nginx) if needed

## Contributing

1. Follow the existing code structure and patterns
2. Add proper error handling for new features
3. Include logging for important operations
4. Update documentation for new endpoints
5. Test thoroughly before deployment

## License

This project is part of the SEMICON-POC and follows the project's licensing terms.