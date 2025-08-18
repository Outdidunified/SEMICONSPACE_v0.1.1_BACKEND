// services/search_service/modules/search/typesense.client.ts
import * as Typesense from 'typesense';
import * as dotenv from 'dotenv';

dotenv.config();

export const typesenseClient = new Typesense.Client({
  nodes: [
    {
      host: process.env.TYPESENSE_HOST,
      port: Number(process.env.TYPESENSE_PORT),
      protocol: process.env.TYPESENSE_PROTOCOL,
    },
  ],
  apiKey: process.env.TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 2,
});
