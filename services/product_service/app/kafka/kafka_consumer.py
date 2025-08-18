import asyncio
import json
import logging
from typing import Dict, Any, List
from aiokafka import AIOKafkaConsumer
from app.database import engine
from app.models.semicon_products import SemiconProduct

logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP_SERVERS = "172.235.17.60:9092"
KAFKA_TOPIC = "payment.success"
KAFKA_CONSUMER_GROUP = "stock_reducer_group"

def safe_json_deserializer(m: bytes) -> Dict[str, Any]:
    try:
        return json.loads(m.decode("utf-8"))
    except Exception as e:
        logger.error(f"Failed to deserialize Kafka message: {e}")
        return {}

async def reduce_stock_for_items(items: List[Dict[str, Any]]):
    for item in items:
        product_id = item.get("productId")
        qty = item.get("qty", 1)
        if not product_id:
            logger.warning("⚠️ productId missing in item")
            continue

        product = await engine.find_one(SemiconProduct, SemiconProduct.semicon_part_number == product_id)
        if not product:
            logger.warning(f"❌ Product {product_id} not found")
            continue

        if product.quantity_available is None:
            logger.warning(f"⚠️ Product {product_id} has no quantity set, skipping update")
            continue

        if product.quantity_available < qty:
            logger.warning(f"⚠️ Not enough stock for product {product_id} (Available: {product.quantity_available}, Requested: {qty})")
            continue

        product.quantity_available -= qty
        await engine.save(product)
        logger.info(f"✅ Product {product_id} stock reduced by {qty}. New quantity = {product.quantity_available}")

async def start_consumer():
    consumer = AIOKafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id=KAFKA_CONSUMER_GROUP,
        client_id="product-service-consumer",
        value_deserializer=safe_json_deserializer,
        enable_auto_commit=True,
        auto_offset_reset="latest",
        session_timeout_ms=30000,
        heartbeat_interval_ms=10000,
        request_timeout_ms=40000,
        max_poll_interval_ms=600000,
    )
    await consumer.start()
    logger.info(f"Started Kafka consumer on topic '{KAFKA_TOPIC}'")
    try:
        async for msg in consumer:
            event = msg.value
            if not event:
                logger.warning("⚠️ Received empty or None event, skipping")
                continue

            logger.info(f"Received event: {event}")
            items = event.get("items", [])

            if not items:
                logger.warning("⚠️ No items found in payment event, skipping stock update")
                continue

            await reduce_stock_for_items(items)
    except asyncio.CancelledError:
        logger.info("Kafka consumer task cancelled")
    except Exception as e:
        logger.error(f"Kafka consumer error: {e}")
    finally:
        await consumer.stop()
        logger.info("Kafka consumer stopped")