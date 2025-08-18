#!/bin/bash

echo "🚀 Starting Payment Consumer Service..."
echo "📡 Listening for payment success messages from Kafka..."

# Run the standalone consumer
npx ts-node src/kafka/payment-consumer-standalone.ts
