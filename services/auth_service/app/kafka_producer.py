# app/kafka_producer.py
import os
import json
import asyncio
import logging
from typing import Optional
from aiokafka import AIOKafkaProducer
from aiokafka.errors import KafkaConnectionError
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
load_dotenv()

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "172.235.17.60:9092")
producer: Optional[AIOKafkaProducer] = None


async def start_kafka(max_retries: int = 0, retry_delay: int = 3) -> None:
    """
    Start Kafka producer and wait until it connects.
    max_retries=0 means infinite retries until success.
    """
    global producer
    producer = AIOKafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )

    attempt = 1
    while True:
        try:
            await producer.start()
            logger.info("✅ Kafka producer started and connected.")
            return
        except KafkaConnectionError as e:
            if max_retries and attempt >= max_retries:
                raise RuntimeError(
                    f"❌ Kafka connection failed after {attempt} attempts."
                ) from e
            logger.warning(
                f"⏳ Kafka not ready, retrying in {retry_delay}s "
                f"(Attempt {attempt}{'' if max_retries == 0 else f'/{max_retries}'})... Error: {e}"
            )
            attempt += 1
            await asyncio.sleep(retry_delay)
        except Exception as e:
            logger.error(f"❌ Unexpected error starting Kafka producer: {e}")
            raise


async def stop_kafka() -> None:
    if producer:
        await producer.stop()
        logger.info("✅ Kafka producer stopped")
    else:
        logger.info("ℹ️ Kafka producer was not running")


async def send_event(topic: str, data: dict) -> None:
    if not producer:
        logger.warning("⚠️ Kafka producer is not initialized. Cannot send event.")
        return
    try:
        await producer.send_and_wait(topic, data)
        logger.info(f"✅ Event sent to topic '{topic}': {data}")
    except Exception as e:
        logger.error(f"❌ Failed to send event to topic '{topic}': {e}")
        raise
