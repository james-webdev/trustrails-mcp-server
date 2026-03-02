#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// TrustRails API configuration
const API_KEY = process.env.TRUSTRAILS_API_KEY || "mcp-public-2026";
const BASE_URL = process.env.TRUSTRAILS_BASE_URL || "https://trustrails.app";

/**
 * TrustRails MCP Server
 *
 * Provides access to UK electronics product data from multiple retailers
 * through a unified API.
 */

interface SearchParams {
  query?: string;
  min_price?: number;
  max_price?: number;
  brand?: string;
  category?: string;
  lite?: boolean;
  limit?: number;
}

interface Product {
  id: string;
  title: string;
  description?: string;
  brand?: string;
  price: number;
  currency: string;
  availability: string;
  stock: number;
  delivery_time: string;
  image_url?: string;
  category: string;
  product_type: 'product' | 'accessory';
  specs: Record<string, any>;
  provenance: {
    source: string;
    last_updated: string;
  };
  purchase_url: string;
}

interface SearchResponse {
  products: Product[];
  total: number;
}

// Create server instance
const server = new Server(
  {
    name: "trustrails",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Search for products across UK electronics retailers
 */
async function searchProducts(params: SearchParams): Promise<SearchResponse> {
  const searchParams = new URLSearchParams();

  if (params.query) {
    searchParams.append("query", params.query);
  }

  if (params.min_price && params.min_price > 0) {
    searchParams.append("min_price", params.min_price.toString());
  }

  if (params.max_price && params.max_price > 0) {
    searchParams.append("max_price", params.max_price.toString());
  }

  if (params.brand) {
    searchParams.append("brand", params.brand);
  }

  if (params.category) {
    searchParams.append("category", params.category);
  }

  if (params.lite) {
    searchParams.append("lite", "true");
  }

  if (params.limit && params.limit > 0) {
    searchParams.append("limit", params.limit.toString());
  }

  const url = `${BASE_URL}/api/search?${searchParams.toString()}`;

  const response = await fetch(url, {
    headers: {
      ...(API_KEY && { "Authorization": `Bearer ${API_KEY}` }),
    },
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`);
  }

  return await response.json() as SearchResponse;
}

/**
 * Get detailed information about a specific product
 */
async function getProduct(productId: string): Promise<Product> {
  const url = `${BASE_URL}/api/product/${productId}`;

  const response = await fetch(url, {
    headers: {
      ...(API_KEY && { "Authorization": `Bearer ${API_KEY}` }),
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Product not found: ${productId}`);
    }
    throw new Error(`Failed to get product: ${response.statusText}`);
  }

  return await response.json() as Product;
}

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_products",
        description:
          "Search 26,000+ UK electronics products across multiple retailers. " +
          "Returns summary data: title, brand, price, availability, category, and purchase link. " +
          "Specs are minimal — for full technical specifications, call get_product with the product ID. " +
          "Covers: Laptops, Desktops, Phones, Tablets, Headphones, Monitors, TVs, Cameras, Keyboards, Mice, Speakers, Gaming, " +
          "Wearables, Printers, Networking, Storage, Audio, Drones, Cables & Chargers. " +
          "All prices in GBP. " +
          "IMPORTANT RULES: " +
          "1) Decompose the user's request into query + filters. Example: 'Sony headphones under £200' → query='headphones', brand='Sony', max_price=200. " +
          "2) DO NOT put brand names, prices, or model numbers in the query — use the brand, min_price, max_price filters instead. " +
          "3) Keep the query to 1-3 generic words describing the product type. " +
          "4) Always set lite=true to reduce payload size. " +
          "5) If 0 results, try a shorter/broader query or drop filters. " +
          "6) Use get_product for full specs — do not rely on search results for detailed attributes. " +
          "AI USAGE PROTOCOL: " +
          "For simple browsing, search with lite=true is sufficient. " +
          "For spec-based queries (wattage, ports, RAM, screen size, weight, etc.), ALWAYS search first, then call get_product on the top 3-5 results and validate constraints against the full specs before recommending. " +
          "Do not assume technical specs from titles alone. If specs are missing, state that explicitly.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "1-3 words describing the product type. Matched against product title. " +
                "DO NOT include brand names, prices, model numbers, or specs — use filters instead. " +
                "Good: 'laptop', 'headphones', 'charger', 'gaming monitor'. " +
                "Bad: 'Samsung Galaxy S25 Ultra', 'USB-C charger 65W', 'laptop under 500'.",
            },
            min_price: {
              type: "number",
              description: "Minimum price in GBP. Use this instead of putting prices in the query.",
            },
            max_price: {
              type: "number",
              description: "Maximum price in GBP. Use this instead of putting prices in the query.",
            },
            brand: {
              type: "string",
              description:
                "Filter by brand name (exact match, case-insensitive). " +
                "Use this instead of putting brand names in the query. " +
                "Examples: Apple, Samsung, Sony, HP, Dell, Lenovo, Anker, Bose, LG",
            },
            category: {
              type: "string",
              description:
                "Filter by product category. Use ONLY these exact values: " +
                "Laptops, Desktops, Tablets, Phones, TVs, Monitors, " +
                "Headphones, Speakers, Cameras, Keyboards, Mice, Printers, Networking, " +
                "Storage, Gaming, Wearables, Drones, Audio, Cables & Chargers. " +
                "NOTE: 'Smartphones' is not valid — use 'Phones'. 'Televisions' is not valid — use 'TVs'.",
            },
            lite: {
              type: "boolean",
              description:
                "Return trimmed product objects with only essential fields " +
                "(id, title, brand, price, availability, image_url, purchase_url). " +
                "Always set to true unless the user specifically needs full product objects.",
            },
            limit: {
              type: "number",
              description: "Maximum number of products to return (default 50, max 100)",
            },
          },
        },
      },
      {
        name: "get_product",
        description:
          "Get full details for a single product by ID. " +
          "Returns complete technical specifications (model number, dimensions, raw category, and all available attributes), " +
          "full description, pricing, stock level, delivery time, and retailer source. " +
          "Use this after search_products to get detailed specs for comparison or recommendations. " +
          "Always call this when a user needs precise product attributes, compatibility info, or side-by-side comparisons.",
        inputSchema: {
          type: "object",
          properties: {
            product_id: {
              type: "string",
              description: "The unique product ID",
            },
          },
          required: ["product_id"],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "search_products": {
        const searchArgs = args as SearchParams;
        const results = await searchProducts(searchArgs);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case "get_product": {
        const { product_id } = args as { product_id: string };

        if (!product_id) {
          throw new Error("product_id is required");
        }

        const product = await getProduct(product_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(product, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is used for MCP protocol)
  console.error("TrustRails MCP Server running");
  console.error(`Base URL: ${BASE_URL}`);
  console.error(`API Key: ${API_KEY ? "configured" : "not configured"}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
