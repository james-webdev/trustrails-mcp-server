#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// TrustRails API configuration
const API_KEY = process.env.TRUSTRAILS_API_KEY || "mcp-public-2026";
const BASE_URL = process.env.TRUSTRAILS_BASE_URL || "https://trustrails.app";

// package.json sits one level above both src/ and dist/
const pkg: { version: string } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8")
);

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

const CONSTRAINT_NAMES = ["memory_gb", "storage_gb", "power_w", "refresh_hz", "resolution_p", "screen_in", "wifi_gen"] as const;

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

type Availability = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

interface Offer {
  id: string;
  source: string;
  title: string;
  price: number;
  currency: string;
  availability: Availability;
  stock: number | null;
  delivery_time: string;
  purchase_url: string;
  image_url?: string;
  last_updated: string;
}

interface Product {
  id: string;
  ean?: string;
  title: string;
  brand?: string;
  price: number;
  currency: string;
  availability: Availability;
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
  offer_count?: number;
  offers?: Offer[];
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
    version: pkg.version,
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

  if (params.constraints != null) {
    searchParams.append("constraints", JSON.stringify(params.constraints));
  }

  if (params.lite === true) {
    searchParams.append("lite", "true");
  }

  if (typeof params.limit === "number") {
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
  const url = `${BASE_URL}/api/product/${encodeURIComponent(productId)}`;

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

const TOOLS: Tool[] = [
  {
    name: "search_products",
    description:
      "HOW TO CALL THIS TOOL — read before every call: " +
      "Decompose the user's request into filters first. Only what's left over goes in query. " +
      "STEP 1: brand name → brand filter. STEP 2: product category → category filter. STEP 3: price → min_price/max_price. STEP 4: RAM, storage, screen size, resolution, refresh rate, wattage, Wi-Fi generation → constraints. STEP 5: what remains → query. " +
      "BAD: query='Sony headphones under £200' | GOOD: brand='Sony', category='Headphones', max_price=200, no query. " +
      "BAD: query='tablet' | GOOD: category='Tablets', no query. " +
      "BAD: query='macbook neo' | GOOD: brand='Apple', category='Laptops', query='neo'. " +
      "BAD: query='Samsung QLED TV' | GOOD: brand='Samsung', category='TVs', query='qled'. " +
      "If brand+category alone cover what the user wants, omit query entirely. " +
      "Only put differentiating terms in query: model lines (neo, ultra, oled), variants, model numbers (WH-1000XM5, s25 ultra). " +
      "Query words must appear in the title, except words naming the category ('router' in Networking) and bare numbers or specs ('4070', '16GB'), which are ignored when finding products and only rank them. Put a model number with its prefix ('RTX 4070', not '4070') and check each title for it. Leave out use-case words like gaming, cheap or best. " +
      "CROSS-CATEGORY NOTE: Gaming headsets → category='Headphones', query='gaming headset'. The Gaming category is consoles/controllers/accessories only. " +
      "Always set lite=true. If 0 results, broaden the query or drop filters (but never present a near miss as meeting a requirement). " +
      "Searches 26,000+ UK electronics products across 7 retailers with price comparison. Prices are in GBP. " +
      "PRICE COMPARISON: if offer_count > 1, call get_product for the 1-3 products you will recommend, not for every result, and show the cheapest in-stock retailer, the other prices with the difference and the exact saving among in-stock offers (offers[] is sorted in-stock first, then cheapest). " +
      "Only claim a saving between offers of the same configuration: if an attribute is `conflicting`, check offers[].title first. " +
      "For specs not in `attributes` (ports, weight, battery), call get_product on the top 3-5 results; don't guess them from titles. " +
      "SPEC REQUIREMENTS: put exact requirements in `constraints`, not in query, and always set `category` (and brand if known) with them: a search of only specs is rejected. " +
      "If a requirement is ambiguous (e.g. '16GB' could be RAM or storage), ask the user or search without that constraint. " +
      "With constraints, every product has `constraint_status` per name: " +
      "'matched' = a retailer's title states a value that meets it. 'unverified' = not known to meet it: check `attributes[name]`, where `conflicting` means retailers disagree and missing means unknown. " +
      "Never treat 'unverified' as a match or say a product meets a requirement because it was returned: tell the user it is unconfirmed. " +
      "Products whose stated value fails are left out (`excluded_by_constraints`). Matched results come first, also with sort='price_asc'. " +
      "With constraints, `total` counts the products that match every constraint and `unverified_total` the unverified products that passed the other filters (only some may be in `products`). If `total` is 0, say no product is known to meet every requirement and offer the unverified ones only as unconfirmed. " +
      "With lite=true, `attributes` holds only the constrained names, as {status, value} or {status, values} when conflicting: state the value from there, and call get_product for the rest. " +
      "If `candidates_truncated` is true, the first 2,000 candidates in the chosen sort order were checked and more exist: add a brand or category, or a narrower query, and search again before saying nothing matches. If the search was already narrowed, tell the user the results may be incomplete. " +
      "STOCK: availability is in_stock, low_stock, out_of_stock or unknown (the retailer gave no stock signal: say so, don't assume). When availability is out_of_stock, mention it as an alternative and suggest checking back — do not silently omit it.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Refinement terms ONLY — model lines, series, variants, model numbers (e.g. 'neo', 'ultra', 'oled', 'WH-1000XM5', 's25 ultra'). " +
            "NEVER a category name: BAD query='tablet', query='smartwatch', query='laptop'. Set the category filter instead. " +
            "NEVER a brand name: BAD query='Sony'. Set the brand filter instead. " +
            "NEVER a price. " +
            "Omit entirely when browsing a category or brand — 'show me tablets' = category='Tablets', no query.",
        },
        min_price: {
          type: "number",
          description: "Minimum price in GBP.",
        },
        max_price: {
          type: "number",
          description: "Maximum price in GBP.",
        },
        brand: {
          type: "string",
          description:
            "Filter by brand name (exact match, case-insensitive). Examples: Apple, Samsung, Sony, HP, Dell, Lenovo, Anker, Bose, LG",
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
            "Return trimmed product objects with only essential fields (id, title, brand, price, currency, availability, image_url, purchase_url, offer_count and, with constraints, constraint_status and the status and value of the constrained names). Always set to true unless full product objects are needed.",
        },
        limit: {
          type: "number",
          description: "Maximum number of products to return (default 50, max 100)",
        },
        sort: {
          type: "string",
          description:
            "Sort order: 'relevance' (default), 'price_asc' (in stock first, then cheapest), 'price_desc' (in stock first, then most expensive).",
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
      "It also returns pricing, availability, delivery time, and all retailer offers with per-retailer pricing (offers[].stock is a unit count only when the retailer supplies one, otherwise null). " +
      "Accepts both canonical product IDs and original retailer offer IDs. " +
      "Use this after search_products to get detailed specs for comparison or recommendations. " +
      "Always call this when a user needs precise product attributes, compatibility info, side-by-side comparisons, or price comparison across retailers.",
    inputSchema: {
      type: "object",
      properties: {
        product_id: {
          type: "string",
          description: "The unique product ID from search results",
        },
      },
      required: ["product_id"],
    },
  },
];
// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
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
