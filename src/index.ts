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
  constraints?: SpecConstraints;
  lite?: boolean;
  limit?: number;
  sort?: string;
}

type Op = "eq" | "gte" | "lte";

const CONSTRAINT_NAMES = ["memory_gb", "storage_gb", "screen_in", "resolution_p", "refresh_hz", "power_w", "wifi_gen"] as const;

type ConstraintName = (typeof CONSTRAINT_NAMES)[number];

type SpecConstraints = Partial<Record<ConstraintName, Partial<Record<Op, number>>>>;

type ConstraintStatus = "matched" | "unverified";

interface AttributeSource {
  retailer: string;
  field: "title";
}

type Attribute =
  | { status: "confirmed" | "inferred"; value: number; sources?: AttributeSource[] }
  | { status: "conflicting"; values: Array<{ value: number; sources?: AttributeSource[] }> };

type Attributes = Partial<Record<ConstraintName, Attribute>>;

interface Product {
  id: string;
  title: string;
  brand?: string;
  price: number;
  currency: string;
  availability: string;
  delivery_time: string;
  image_url?: string;
  category: string;
  product_type: 'product' | 'accessory';
  specs: {
    description?: string;
    model_number?: string;
    dimensions?: string;
  };
  provenance: {
    source: string;
    last_updated: string;
  };
  purchase_url: string;
  attributes?: Attributes;
  constraint_status?: Partial<Record<ConstraintName, ConstraintStatus>>;
}

interface SearchResponse {
  products: Product[];
  total: number;
  constraints?: SpecConstraints;
  excluded_by_constraints?: number;
  unverified_total?: number;
  candidates_truncated?: boolean;
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

  if (params.constraints && Object.keys(params.constraints).length > 0) {
    searchParams.append("constraints", JSON.stringify(params.constraints));
  }

  if (params.lite) {
    searchParams.append("lite", "true");
  }

  if (params.limit && params.limit > 0) {
    searchParams.append("limit", params.limit.toString());
  }

  if (params.sort) {
    searchParams.append("sort", params.sort);
  }

  const url = `${BASE_URL}/api/search?${searchParams.toString()}`;

  const response = await fetch(url, {
    headers: {
      ...(API_KEY && { "Authorization": `Bearer ${API_KEY}` }),
    },
  });

  if (!response.ok) {
    // A bad constraints argument comes back as 400 {error}
    if (response.status === 400) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (body?.error) throw new Error(`Search failed: ${body.error}`);
    }
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
          "Search 26,000+ deduplicated UK electronics products across multiple retailers with price comparison. " +
          "Returns summary data: title, brand, price, availability, category, purchase link, and offer_count. " +
          "When offer_count > 1, the product is available from multiple retailers — call get_product for the 1-3 products you will recommend, not for every result, to see all offers. " +
          "Searches that pass constraints add constraint_status and the constrained attributes; for every attribute, the retailer's description and all offers, call get_product with the product ID. " +
          "Only compare prices and claim savings between offers of the same configuration: if any attribute is `conflicting`, check offers[].title first and never claim a saving between different sizes or configurations. " +
          "All prices in GBP. " +
          "IMPORTANT RULES: " +
          "1) Decompose the user's request: extract brand → brand filter, category → category filter, price → price filters, RAM/storage/screen size/resolution/refresh rate/wattage/Wi-Fi generation → constraints. What remains is the query. " +
          "   Example: 'Sony headphones under £200' → brand='Sony', category='Headphones', max_price=200, query omitted. " +
          "   Example: 'MacBook Neo' → brand='Apple', category='Laptops', query='neo'. " +
          "   Example: 'Samsung QLED TV' → brand='Samsung', category='TVs', query='qled'. " +
          "   Example: 'Sony WH-1000XM5' → brand='Sony', category='Headphones', query='WH-1000XM5'. " +
          "2) DO NOT put brand names, product family names, full product name strings, or prices in the query — use filters. DO put differentiating identifiers: model lines, series, variants, technology descriptors, and model numbers (e.g. 'neo', 'ultra', 'oled', 'qled', 'WH-1000XM5', 's25 ultra'). Any product family name uniquely associated with a brand (e.g. MacBook→Apple, Galaxy→Samsung, ThinkPad→Lenovo) is already implied by brand+category — never put it in query. BAD: query='macbook neo' → GOOD: brand='Apple', category='Laptops', query='neo'. " +
          "3) If brand + category alone fully describe what the user wants, omit the query entirely — fewer query words gives cleaner results. " +
          "Query words must appear in the title, except words naming the category ('router' in Networking) and bare numbers or specs ('4070', '16GB'), which are ignored when finding products and only rank them. Put a model number with its prefix ('RTX 4070', not '4070') and check each title for it. Leave out use-case words like gaming, cheap or best. " +
          "4) Always set lite=true to reduce payload size. " +
          "5) If 0 results, try a shorter/broader query or drop filters (but never present a near miss as meeting a requirement). " +
          "6) Use get_product for a product's attributes, description and every offer — do not rely on search results for detailed attributes. " +
          "AI USAGE PROTOCOL: " +
          "For simple browsing, search with lite=true is sufficient. " +
          "For specs not in `attributes` (ports, weight, battery), ALWAYS search first, then call get_product on the top 3-5 results and validate against the description before recommending; don't guess them from titles. If specs are missing, state that explicitly. " +
          "SPEC REQUIREMENTS: put exact requirements in `constraints`, not in query, and always set `category` (and brand if known) with them: a search of only specs, with no category, brand or search words, is rejected. " +
          "If a requirement is ambiguous (e.g. '16GB' could be RAM or storage), ask the user or search without that constraint. " +
          "With constraints, every product has `constraint_status` per name: " +
          "'matched' = a retailer's title states a value that meets it. 'unverified' = not known to meet it: check `attributes[name]`, where `conflicting` means retailers disagree and missing means unknown. " +
          "Never treat 'unverified' as a match or say a product meets a requirement because it was returned: tell the user it is unconfirmed. " +
          "Products whose stated value fails are left out (`excluded_by_constraints`). Matched results come first, also with sort='price_asc'. " +
          "With constraints, `total` counts the products that match every constraint and `unverified_total` the unverified products that passed the other filters (only some may be in `products`). If `total` is 0, say no product is known to meet every requirement and offer the unverified ones only as unconfirmed. " +
          "With lite=true, `attributes` holds only the constrained names, as {status, value} or {status, values} when conflicting: state the value from there, and call get_product for the rest. " +
          "If `candidates_truncated` is true, the first 2,000 candidates in the chosen sort order were checked and more exist: add a brand or category, or a narrower query, and search again before saying nothing matches. If the search was already narrowed, tell the user the results may be incomplete. " +
          "STOCK AVAILABILITY: When a product is availability: out_of_stock, do not recommend it as a purchase. Instead mention it as a notable alternative — especially if it offers a meaningful price advantage — and suggest the user check back. Example: 'This model is £X cheaper at [retailer] but currently out of stock — worth checking back if you're not in a rush.' Never silently omit out-of-stock results; surface them transparently.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Refinement terms after brand and category are extracted. Use for model lines, series names, variants, or model numbers (e.g. 'neo', 'ultra', 'oled', 'qled', 'WH-1000XM5'). " +
                "Query words must appear in the title, except words naming the category ('router' in Networking) and bare numbers or specs ('4070', '16GB'), which are ignored when finding products and only rank them: put a model number with its prefix ('RTX 4070', not '4070') and check each title for it. " +
                "DO NOT include brand names, product family names, or prices — use filters. " +
                "Omit entirely if brand + category fully describe what the user wants.",
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
            constraints: {
              type: "object",
              description:
                "Hard spec requirements, checked per product against its attributes. Shape {name: {op: number}} with op eq, gte or lte; a range is {gte, lte}. " +
                "On every operator, storage matches within 3% and screen size within 0.5 inch; a whole-number screen size N also covers up to N+1 on eq and lte (gte is unchanged); other specs exactly: gte 1024 accepts a 1TB drive, eq 22 a 21.5\" screen, eq 13 a 13.6\" one, lte 15 a 15.6\" one. " +
                "Example: {\"memory_gb\": {\"gte\": 24}, \"storage_gb\": {\"gte\": 1000}, \"screen_in\": {\"eq\": 15}}. " +
                "Names and units: memory_gb (RAM, GB), storage_gb (GB, 1TB = 1000), screen_in (inches), resolution_p (pixels high: 4K = 2160, QHD = 1440, Full HD = 1080), " +
                "refresh_hz (Hz), power_w (W), wifi_gen (Wi-Fi generation: 6, 6E = 6.5, 7). " +
                "A spec written in query counts only when it says what it is ('24GB RAM', '1TB', '144Hz', '55\"') and means at least, except screen size (that size); a bare '24GB' stays a search word. Explicit constraints win over it.",
              properties: Object.fromEntries(
                CONSTRAINT_NAMES.map((name) => [
                  name,
                  { type: "object", properties: { eq: { type: "number" }, gte: { type: "number" }, lte: { type: "number" } } },
                ])
              ),
            },
            lite: {
              type: "boolean",
              description:
                "Return trimmed product objects with only essential fields " +
                "(id, title, brand, price, currency, availability, image_url, purchase_url, offer_count and, with constraints, constraint_status and the status and value of the constrained names). " +
                "Always set to true unless the user specifically needs full product objects.",
            },
            limit: {
              type: "number",
              description: "Maximum number of products to return (default 50, max 100)",
            },
            sort: {
              type: "string",
              description: "Sort order: 'relevance' (default), 'price_asc' (cheapest first), 'price_desc' (most expensive first). Use 'price_asc' when comparing prices.",
            },
          },
        },
      },
      {
        name: "get_product",
        description:
          "Get full details for a single product by ID. " +
          "Returns `attributes`: structured specs read from retailer titles, each name mapping to {status, value, sources}; a conflicting one has values: [{value, sources}] instead of value and sources. " +
          "Names and units as in the search constraints argument. status: 'confirmed' = two or more retailers state the same value; 'inferred' = one retailer's title states it; " +
          "'conflicting' = retailers state different values (none is picked, tell the user they disagree; a retailer can appear under two values, so read offers[].title to see which listing states which); a missing name = unknown. " +
          "Also returns specs.description, the retailer's own prose: use it only for details attributes do not cover (processor, GPU, ports, weight, battery, features). " +
          "It can describe another configuration or a maximum ('up to 32GB'), so it never overrides or fills in an attribute: if an attribute is missing or conflicting, that spec is unknown or unconfirmed, and you may mention what the description says only as 'the retailer's description mentions X, unconfirmed'. " +
          "It also returns pricing, availability, delivery time, and all retailer offers with per-retailer pricing. " +
          "Accepts both canonical product IDs and original retailer offer IDs. " +
          "Use this after search_products to get detailed specs for comparison or recommendations. " +
          "Always call this when a user needs precise product attributes, compatibility info, side-by-side comparisons, or price comparison across retailers.",
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
