import { Injectable, Logger } from '@nestjs/common';
import { typesenseClient } from './typesense.client';
import axios from 'axios';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  /**
   * Create or update a product in Typesense, then send to external API
   */
  async createOrUpdateProduct(product: any) {
    try {
      // Ensure required fields exist including manufacturer_part_number
      if (
        !product.productname ||
        !product.category ||
        !product.manufacturer ||
        !product.subcategory ||
        !product.semicon_part_number ||
        !product.manufacturer_part_number
      ) {
        this.logger.warn(
          '⚠️ Missing required product fields including manufacturer_part_number. Skipping save to Typesense.'
        );
        return;
      }

      const document = {
        id: this.generateId(product),
        productname: product.productname,
        category: product.category,
        manufacturer: product.manufacturer,
        subcategory: product.subcategory,
        semicon_part_number: product.semicon_part_number,
        manufacturer_part_number: product.manufacturer_part_number,
      };

      // Store in Typesense
      await typesenseClient
        .collections('products')
        .documents()
        .upsert(document);

      this.logger.log(`✅ Product upserted to Typesense: ${product.productname}`);

      // Send to external recommendations API
      await this.sendToRecommendationAPI(document, product.productname);
    } catch (err: any) {
      this.logger.error(`❌ Error in createOrUpdateProduct: ${err.message}`, err.stack);
    }
  }

  /**
   * Send product to external API, query is injected into URL path
   */
private async sendToRecommendationAPI(product: any, query: string) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const apiUrl = `http://172.232.110.10:8003/product/search/${encodedQuery}`;

    const response = await axios.get(apiUrl); // ✅ GET instead of POST
    this.logger.log(`📡 Search API called. Status: ${response.status}`);
  } catch (error: any) {
    this.logger.error(`❌ Failed to call Search API: ${error.message}`);
  }
}





  /**
   * Search products in Typesense
   */
  async search(query: string) {
    try {
      const searchParams = {
        q: query,
        query_by: 'productname,category,manufacturer,subcategory,semicon_part_number,manufacturer_part_number',
        prefix: true,
        num_typos: 6,
        per_page: 250,
      };

      const result = await typesenseClient
        .collections('products')
        .documents()
        .search(searchParams);

      return {
        count: result.found,
        hits: result.hits.map(hit => hit.document),
      };
    } catch (err: any) {
      this.logger.error(`❌ Typesense search failed: ${err.message}`);
      return { count: 0, hits: [] };
    }
  }

  /**
   * Generate unique ID for Typesense
   */
  private generateId(product: any): string {
    return `${product.productname}-${product.manufacturer}-${product.semicon_part_number}-${product.manufacturer_part_number}`
      .toLowerCase()
      .replace(/\s+/g, '-');
  }
}
