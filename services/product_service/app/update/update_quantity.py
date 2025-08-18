import logging
from typing import Dict, Any
from app.models.semicon_products import SemiconProduct
from app.database import engine

logger = logging.getLogger(__name__)

async def reduce_product_stock(event: Dict[str, Any]):
    # Normalize keys to expected names
    semicon_part_number = event.get("productId") or event.get("product_id")
    quantity = event.get("qty") or event.get("quantity") or 1

    if not semicon_part_number:
        logger.warning("⚠️ productId missing in event")
        return

    # Fetch product
    product = await engine.find_one(SemiconProduct, SemiconProduct.semicon_part_number == semicon_part_number)
    if not product:
        logger.warning(f"❌ Product {semicon_part_number} not found")
        return

    # Stock check
    if product.quantity_available is None:
        logger.warning(f"⚠️ Product {semicon_part_number} has no quantity set, skipping update")
        return

    if product.quantity_available < quantity:
        logger.warning(
            f"⚠️ Not enough stock for product {semicon_part_number} "
            f"(Available: {product.quantity_available}, Requested: {quantity})"
        )
        return

    product.quantity_available -= quantity
    await engine.save(product)

    logger.info(
        f"✅ Product {semicon_part_number} stock reduced by {quantity}. "
        f"New quantity = {product.quantity_available}"
    )
