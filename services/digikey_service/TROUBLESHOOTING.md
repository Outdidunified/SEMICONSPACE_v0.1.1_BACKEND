# DigiKey Service Troubleshooting Guide

## JSON Parsing Errors

### Error: "Unexpected end of JSON input"

This error occurs when the server receives malformed or incomplete JSON data. Here are the common causes and solutions:

#### Common Causes:

1. **Empty Request Body**
   - Sending a POST request without any body content
   - Solution: Ensure your request includes a valid JSON body

2. **Malformed JSON**
   - Missing quotes around property names
   - Trailing commas
   - Incomplete JSON structure
   - Solution: Validate your JSON syntax

3. **Wrong Content-Type Header**
   - Not setting `Content-Type: application/json`
   - Solution: Always include the correct content-type header

4. **GET Requests with Bodies**
   - Sending a GET request with a request body
   - Solution: GET requests should not have request bodies; use query parameters instead

5. **Network Issues**
   - Request interrupted during transmission
   - Solution: Check network connectivity and retry

#### Examples:

**❌ Incorrect - Empty body:**
```bash
curl -X POST http://localhost:8009/digikey/search/keyword \
  -H "Content-Type: application/json"
```

**✅ Correct:**
```bash
curl -X POST http://localhost:8009/digikey/search/keyword \
  -H "Content-Type: application/json" \
  -d '{"query": "resistor"}'
```

**❌ Incorrect - Invalid JSON:**
```bash
curl -X POST http://localhost:8009/digikey/search/keyword \
  -H "Content-Type: application/json" \
  -d '{query: "resistor"}'  # Missing quotes around property name
```

**✅ Correct:**
```bash
curl -X POST http://localhost:8009/digikey/search/keyword \
  -H "Content-Type: application/json" \
  -d '{"query": "resistor"}'
```

**❌ Incorrect - GET request with body:**
```bash
curl -X GET http://localhost:8009/digikey/health \
  -H "Content-Type: application/json" \
  -d '{"invalid": "body"}'
```

**✅ Correct - GET request without body:**
```bash
curl -X GET http://localhost:8009/digikey/health
```

#### Testing JSON Errors

Use the provided test script to verify error handling:

```bash
node test_json_error.js
```

### Error Responses

The service now provides detailed error responses for JSON parsing issues:

```json
{
  "success": false,
  "error": "Invalid JSON",
  "message": "The request body contains invalid JSON. Please check your JSON syntax.",
  "details": "Common issues: missing quotes, trailing commas, or incomplete JSON structure",
  "timestamp": "2025-04-08T10:20:01.000Z"
}
```

### Health Check

Use the health check endpoint to verify service status:

```bash
curl http://localhost:8009/digikey/health
```

### Debugging Tips

1. **Check Logs**: The service logs detailed information about JSON parsing errors
2. **Validate JSON**: Use online JSON validators before sending requests
3. **Test with curl**: Use curl to test your requests manually
4. **Check Content-Type**: Ensure you're sending `application/json` content-type
5. **Verify Request Body**: Make sure your request body is not empty

### API Endpoints

- `POST /digikey/search/keyword` - Search products (requires JSON body with "query" field)
- `GET /digikey/health` - Health check
- `GET /digikey/stats` - Service statistics
- `GET /digikey/products/:productNumber/productdetails` - Get product details

### Support

If you continue to experience issues:

1. Check the service logs for detailed error information
2. Verify your request format matches the API documentation
3. Test with the provided test script
4. Use the health check endpoint to verify service status