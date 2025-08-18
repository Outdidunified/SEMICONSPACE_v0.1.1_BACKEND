import json
import logging
import asyncio
from aiokafka import AIOKafkaConsumer
from aiokafka.errors import KafkaConnectionError
from sqlalchemy import text
from datetime import datetime
from dateutil.parser import isoparse  # For parsing ISO 8601 strings
from app.database import SessionLocal as async_session

logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP_SERVERS = "172.235.17.60:9092"
KAFKA_GROUP_ID = "user-events-group"
TOPICS = ["user.created", "user.status.updated", "user.phone.updated"]

# -----------------------------
# Core Kafka consume loop
# -----------------------------
async def consume():
    consumer = AIOKafkaConsumer(
        *TOPICS,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id=KAFKA_GROUP_ID,
        value_deserializer=lambda m: json.loads(m.decode("utf-8")),
        enable_auto_commit=True,
        auto_offset_reset="latest",
        session_timeout_ms=30000,
        heartbeat_interval_ms=10000,
        request_timeout_ms=40000,
        max_poll_interval_ms=600000,
    )
    await consumer.start()
    try:
        async for msg in consumer:
            topic = msg.topic
            payload = msg.value
            if payload is None or not isinstance(payload, dict) or not payload.get("success") or not payload.get("data"):
                logger.warning(f"⚠️ Invalid message in {topic}: {payload}")
                continue

            data = payload["data"]
            user_id = data.get("userId")
            if not user_id:
                logger.error(f"Missing userId in {topic} event: {data}")
                continue

            try:
                if topic == "user.created":
                    await handle_user_created(data)
                elif topic == "user.status.updated":
                    await handle_user_status_updated(data)
                elif topic == "user.phone.updated":
                    await handle_user_phone_updated(data)

            except Exception as e:
                logger.error(f"❌ Error handling {topic} for user {user_id}: {e}")

    finally:
        await consumer.stop()

# -----------------------------
# Event Handlers
# -----------------------------
async def handle_user_created(data):
    async with async_session() as session:
        # Validate required fields
        required_fields = ["userId", "first_name", "last_name", "email", "phone", "role", "role_id", "created_at", "created_by"]
        if not all(field in data for field in required_fields):
            missing = [field for field in required_fields if field not in data]
            logger.error(f"Missing required fields in user.created event: {missing}, data: {data}")
            return

        # Handle password (accept 'pass' as fallback, warn about incorrect field name)
        password = data.get("password") or data.get("pass")
        if not password:
            logger.error(f"Missing password in user.created event: {data}")
            return
        if "pass" in data and "password" not in data:
            logger.warning(f"Deprecated field 'pass' used in user.created event for user {data['userId']}; use 'password' instead")

        
        # Parse created_at to datetime and make naive
        try:
            created_at = isoparse(data["created_at"]).replace(tzinfo=None)    
        except ValueError as e:
            logger.error(f"Invalid created_at format in user.created event: {data['created_at']}")
            return
        #print(f"{data}")
        query = text("""
            INSERT INTO public.users
            ("userId", first_name, last_name, email, phone, password, role, role_id, created_at, created_by, status)
            VALUES (:userId, :first_name, :last_name, :email, :phone, :password, :role, :role_id, :created_at, :created_by, :status)
            ON CONFLICT ("userId") DO NOTHING
        """)
        try:
            await session.execute(query, {
                "userId": data["userId"],
                "first_name": data["first_name"],
                "last_name": data["last_name"],
                "email": data["email"],
                "phone": data["phone"],
                "password": password,
                "role": data["role"],
                "role_id": int(data["role_id"]) if data["role_id"] else None,
                "created_at": created_at,
                "created_by": data["created_by"],
                "status": True
            })
            await session.commit()
            logger.info(f"✅ Processed event user.created for user {data['userId']}")
        except Exception as e:
            logger.error(f"Database error in user.created: {e}")
            await session.rollback()
            
async def handle_user_status_updated(data):
    async with async_session() as session:
        # Validate required fields
        required_fields = ["userId", "newStatus", "modifiedBy", "modifiedDate"]
        if not all(field in data for field in required_fields):
            logger.error(f"Missing required fields in user.status.updated event: {data}")
            return

        # Parse modifiedDate to datetime and make naive
        try:
            modified_at = isoparse(data["modifiedDate"]).replace(tzinfo=None)
        except ValueError as e:
            logger.error(f"Invalid modifiedDate format in user.status.updated event: {data['modifiedDate']}")
            return

        query = text("""
            UPDATE public.users
            SET status = :status,
                modified_by = :modified_by,
                modified_at = :modified_at
            WHERE "userId" = :userId
        """)
        try:
            await session.execute(query, {
                "status": data["newStatus"],
                "modified_by": data["modifiedBy"],
                "modified_at": modified_at,
                "userId": data["userId"],
            })
            await session.commit()
            logger.info(f"✅ Processed event user.status.updated for user {data['userId']}")
        except Exception as e:
            logger.error(f"Database error in user.status.updated: {e}")
            await session.rollback()

async def handle_user_phone_updated(data):
    async with async_session() as session:
        # Validate required fields
        required_fields = ["userId", "newPhone", "modifiedBy", "modifiedDate"]
        if not all(field in data for field in required_fields):
            logger.error(f"Missing required fields in user.phone.updated event: {data}")
            return

        # Parse modifiedDate to datetime and make naive
        try:
            modified_at = isoparse(data["modifiedDate"]).replace(tzinfo=None)
        except ValueError as e:
            logger.error(f"Invalid modifiedDate format in user.phone.updated event: {data['modifiedDate']}")
            return

        query = text("""
            UPDATE public.users
            SET phone = :phone,
                modified_by = :modified_by,
                modified_at = :modified_at
            WHERE "userId" = :userId
        """)
        try:
            await session.execute(query, {
                "phone": data["newPhone"],
                "modified_by": data["modifiedBy"],
                "modified_at": modified_at,
                "userId": data["userId"],
            })
            await session.commit()
            logger.info(f"✅ Processed event user.phone.updated for user {data['userId']}")
        except Exception as e:
            logger.error(f"Database error in user.phone.updated: {e}")
            await session.rollback()

# -----------------------------
# Start Consumer with Reconnect
# -----------------------------
async def start_consumer():
    """Runs Kafka consumer with auto-reconnect."""
    while True:
        try:
            logger.info("🚀 Starting Kafka consumer...")
            await consume()
        except KafkaConnectionError as e:
            logger.warning(f"⚠️ Kafka connection lost: {e}. Retrying in 5 seconds...")
            await asyncio.sleep(5)
        except Exception as e:
            logger.error(f"❌ Unexpected Kafka consumer error: {e}. Retrying in 5 seconds...")
            await asyncio.sleep(5)