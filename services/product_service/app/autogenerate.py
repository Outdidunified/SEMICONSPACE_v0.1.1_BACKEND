from app.models.counter import Counter
from app.models.categories_models import SemiconCategory
from app.models.manufacturers_models import SemiconManufacturer
from app.models.product_varianants import VendorProduct as SemiconProductVariant
from app.models.variant_pricing_models import SemiconProductVariantPricing
from app.models.vendors_product_variant_parameters import VendorProductVariantParameter
from app.models.vendor_product_variants_models import VendorProduct as VendorProductModel
from app.database import engine


async def initialize_counters():
    async def set_initial(name: str, docs, attr: str):
        max_id = max(
            [int(getattr(doc, attr).split("-")[1]) for doc in docs if getattr(doc, attr, None)],
            default=0
        )
        counter = await engine.find_one(Counter, Counter.name == name)
        if counter:
            counter.value = max_id
            await engine.save(counter)
        else:
            await engine.save(Counter(name=name, value=max_id))

    # category
    await set_initial("category", await engine.find(SemiconCategory), "semicon_category_id")

    # manufacturer
    await set_initial("manufacturer", await engine.find(SemiconManufacturer), "semicon_manufacturer_id")

    # variant
    await set_initial("variant", await engine.find(SemiconProductVariant), "semicon_product_variant_id")

    # pricing
    await set_initial("pricing", await engine.find(SemiconProductVariantPricing), "semicon_product_variant_pricing_id")

    # parameter
    await set_initial("parameter", await engine.find(VendorProductVariantParameter), "semicon_parameter_id")

    # vendor
    await set_initial("vendor", await engine.find(VendorProductModel), "semicon_vendor_id")
