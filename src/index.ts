#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// TrustRails API configuration
const API_KEY = process.env.TRUSTRAILS_API_KEY || "mcp-public-2026";
const BASE_URL = process.env.TRUSTRAILS_BASE_URL || "https://www.trustrails.app";

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
}

interface Product {
  id: string;
  title: string;
  brand?: string;
  price: number;
  currency: string;
  availability: string;
  stock: number;
  delivery_time: string;
  image_url?: string;
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
          "Search for UK electronics products across multiple retailers (AO, Boxed, etc). " +
          "Returns product details including prices, availability, specs, and purchase links. " +
          "Perfect for price comparison, product research, or building shopping assistants.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (e.g., 'laptop', 'USB-C charger', 'wireless headphones')",
            },
            min_price: {
              type: "number",
              description: "Minimum price filter in GBP (e.g., 100 for products over £100)",
            },
            max_price: {
              type: "number",
              description: "Maximum price filter in GBP (e.g., 500 for products under £500)",
            },
            brand: {
              type: "string",
              description: "Filter by brand name (e.g., 'Sony', 'Apple', 'HP')",
            },
            category: {
              type: "string",
              description: "Filter by product category (e.g., 'Laptops', 'Headphones', 'Monitors')",
            },
          },
        },
      },
      {
        name: "get_product",
        description:
          "Get detailed information about a specific product by ID. " +
          "Returns complete product details including specs, availability, pricing, and retailer information.",
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
