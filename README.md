# TrustRails MCP Server

**Search UK electronics products** - compare prices, find deals, and discover products across multiple retailers.

Built for the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) - works with Claude Desktop, Claude Code, and other MCP-compatible AI assistants.

[![npm version](https://badge.fury.io/js/%40trustrails%2Fmcp-server.svg)](https://www.npmjs.com/package/@trustrails/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Quick Start

No installation needed — just add TrustRails to your Claude config.

### Configuration

**For Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "trustrails": {
      "command": "npx",
      "args": ["-y", "@trustrails/mcp-server"],
      "env": {
        "TRUSTRAILS_API_KEY": "mcp-public-2026"
      }
    }
  }
}
```

**For Claude Code** (`~/.config/claude/config.json`):

```json
{
  "mcpServers": {
    "trustrails": {
      "command": "npx",
      "args": ["-y", "@trustrails/mcp-server"],
      "env": {
        "TRUSTRAILS_API_KEY": "mcp-public-2026"
      }
    }
  }
}
```

That's it! Restart Claude and start searching.

---

## What You Can Do

### Natural Language Product Search

Just ask Claude naturally — it will decompose your request into the right query and filters:

```
"Find me a gaming laptop under £1000"
"I need Sony noise cancelling headphones"
"What HP laptops are available between £500-£700?"
"Show me Anker chargers"
```

Claude will search across multiple UK retailers and show you:
- Real-time prices & availability
- Direct purchase links
- Then call `get_product` for a product's attributes, description and every offer when you need details

---

## Available Tools

### `search_products`

Search 26,000+ UK electronics products. Returns summary data (title, price, availability, category). For a product's structured `attributes`, the retailer's description and every offer, use `get_product`.

**Parameters:**
- `query` (string) - Refinement terms after brand and category are extracted: model lines, series, variants, technology descriptors, or model numbers (e.g., "neo", "ultra", "oled", "WH-1000XM5"). Omit entirely if brand + category alone describe what's needed. Never put brand names, product family names, or prices here — use filters.
- `min_price` (number, optional) - Minimum price in GBP
- `max_price` (number, optional) - Maximum price in GBP
- `brand` (string, optional) - Filter by brand, exact match (e.g., "Sony", "HP", "Apple")
- `category` (string, optional) - Filter by category: Laptops, Desktops, Tablets, Phones, TVs, Monitors, Headphones, Speakers, Cameras, Keyboards, Mice, Printers, Networking, Storage, Gaming, Wearables, Drones, Audio, Cables & Chargers.
- `constraints` (object, optional) - Hard spec requirements, checked per product against its `attributes`: `{"memory_gb":{"gte":24},"storage_gb":{"gte":1000},"screen_in":{"eq":15}}`. Operators `eq`, `gte`, `lte`; a range is `{"gte":..,"lte":..}`. Names and units: `memory_gb` (RAM, GB), `storage_gb` (GB, 1TB = 1000), `screen_in` (inches), `resolution_p` (pixels high: 4K = 2160, QHD = 1440, Full HD = 1080), `refresh_hz` (Hz), `power_w` (W), `wifi_gen` (Wi-Fi generation: 6, 6E = 6.5, 7). On every operator, storage matches within 3% (1TB = 1000–1024GB) and screen size within 0.5 inch; other specs exactly. Wins over the same spec written in `query`. Always set a `category` or `brand` with it. A bad request (unknown name or operator, negative value, a combination nothing can meet such as `gte` above `lte`, or constraints with no category, brand or search words) returns an error listing the valid ones. See [Structured specs](#structured-specs).
- `lite` (boolean, optional) - Return trimmed product objects (reduces payload by ~80%). Always use for LLM integrations.
- `limit` (number, optional) - Maximum products to return (default 50, max 100)
- `sort` (string, optional) - Sort order: `relevance` (default), `price_asc` (cheapest first), `price_desc` (most expensive first). Use `price_asc` when comparing prices. With constraints, matched products still come first.

**Returns:** Up to 50 products with summary data. With `lite: true`, returns only essential fields (id, title, brand, price, currency, availability, image_url, purchase_url, offer_count and, with constraints, `constraint_status` and the `attributes` of the constrained names).

### `get_product`

Get full details for a single product. Returns structured `attributes` (see [Structured specs](#structured-specs)), `specs.description` (the retailer's own prose, for processor, ports, graphics and anything `attributes` does not cover), stock level, delivery time, and all retailer offers with per-retailer pricing. Use after `search_products` for detailed comparison or recommendations.

**Parameters:**
- `product_id` (string) - The product ID from search results

**Returns:** Complete product with structured `attributes`, `specs` (including the retailer's `specs.description`), pricing across all retailers, and provenance information

### Structured specs

`get_product` returns `attributes`: structured specs (RAM, storage, screen size, resolution, refresh rate, power, Wi-Fi generation) read from retailer titles when the catalogue is imported, next to `specs`. Each has a `status`, and a spec nobody states is absent (unknown):

- `confirmed`: two or more retailers state the same value.
- `inferred`: one retailer's title states it.
- `conflicting`: retailers state different values. None is picked; the values are listed with their retailers, and a retailer can appear under two values (check `offers[].title`).

`specs.description` is the retailer's prose. It can describe another configuration or a maximum ("up to 32GB"), so it never overrides or fills in an attribute: a spec missing from `attributes` is unknown.

For one Galaxy S26 Ultra, where only JoyBuy states the RAM (12GB) and two retailers disagree about the storage:

```json
{
  "memory_gb": { "status": "inferred", "value": 12,
    "sources": [{ "retailer": "JoyBuy", "field": "title" }] },
  "storage_gb": { "status": "conflicting", "values": [
    { "value": 256, "sources": [{ "retailer": "Laptops Direct", "field": "title" }] },
    { "value": 512, "sources": [{ "retailer": "JoyBuy", "field": "title" }] } ] }
}
```

Searches with constraints return the constraints applied, `excluded_by_constraints`, `matched_total`, and a `constraint_status` on each product: `matched` (a retailer's title states a value that meets the constraint) or `unverified` (unknown or conflicting: never treat as a match, tell the user it is unconfirmed). Products whose stated value fails a constraint are left out. A lite result also carries the `attributes` of just the constrained names, so a 64GB laptop is told apart from a 16GB one.

- **Tolerance:** storage within 3% (1TB = 1000–1024GB) and screen size within 0.5 inch, on every operator; other specs, memory included, are exact.
- **Specs in `query`:** only a spec that says what it is counts ("24GB RAM", "1TB", "512GB SSD", "144Hz", `55"`). A bare "24GB" stays a search word. Memory, storage, resolution, refresh rate, power and Wi-Fi mean at least; screen size means that size.
- **With only specs:** a search with no category, brand or search words is rejected rather than checking an arbitrary 2,000 products. If a requirement is ambiguous (a bare "16GB" could be RAM or storage), ask the user or search without that constraint.
- **`total`:** with constraints it counts the candidates checked and not left out (matched plus unverified). `matched_total` counts those where every constraint matched.
- **Candidate window:** constraints are checked on the first 2,000 candidates in the chosen sort order. If more exist, the response has `candidates_truncated: true`: add a `brand` or `category`, or a narrower `query`, and search again before concluding that nothing matches. If the search was already narrowed, the results may be incomplete.

---

## Supported Retailers

Search across **26,000+ electronics products** from major UK retailers including AO, with new retailers added regularly.

---

## Example Usage

**Budget shopping:**
```
"Find gaming laptops under £800"
→ category='Laptops', query='gaming', max_price=800, sort='price_asc', lite=true
```

**Brand search:**
```
"I need Sony headphones under £200"
→ brand='Sony', category='Headphones', max_price=200, sort='price_asc', lite=true
```

**Category browsing:**
```
"Show me cheap monitors"
→ category='Monitors', max_price=200, lite=true
```

**Spec requirements:**
```
"A 15 inch laptop with at least 24GB RAM and 1TB storage"
→ category='Laptops', constraints={"memory_gb":{"gte":24},"storage_gb":{"gte":1000},"screen_in":{"eq":15}}, lite=true
```

**Detailed specs:**
```
"Tell me the specs of this laptop"
→ get_product(product_id) — returns its structured attributes, the retailer's description and every offer
```

**Price range:**
```
"Apple products between £500 and £1000"
→ brand='Apple', min_price=500, max_price=1000, lite=true
```

---

## Rate Limits

- **50 requests per hour** per IP address
- Rate limit info included in response headers
- Limits reset every hour

---

## Environment Variables

- `TRUSTRAILS_API_KEY` - API key (use `mcp-public-2026` for shared public access)
- `TRUSTRAILS_BASE_URL` - API endpoint (optional, defaults to `https://trustrails.app`)

---

## Why TrustRails?

- ✅ **Real-time data** - Product feeds updated twice daily
- ✅ **Multiple retailers** - Compare prices in one search
- ✅ **Stock information** - See what's actually available to buy
- ✅ **Direct purchase links** - Click through to buy immediately
- ✅ **Zero setup** - Works out of the box with shared public key
- ✅ **UK-focused** - Optimized for UK electronics shopping

---

## Troubleshooting

**"Command not found" or server not starting**
- Make sure Node.js is installed and `npx` is available: `npx --version`
- Try running manually: `npx -y @trustrails/mcp-server`
- **Using nvm?** Claude Desktop doesn't inherit your shell PATH. Use the full path to node instead:
  ```json
  {
    "command": "/Users/YOUR_USERNAME/.nvm/versions/node/vX.X.X/bin/node",
    "args": ["/Users/YOUR_USERNAME/.nvm/versions/node/vX.X.X/lib/node_modules/@trustrails/mcp-server/dist/index.js"]
  }
  ```
  First run `npm install -g @trustrails/mcp-server`, then find your node path with `which node`.

**"Rate limit exceeded"**
- Wait an hour for limits to reset
- Check `X-RateLimit-Reset` header for exact reset time
- 50 requests/hour is plenty for normal usage

**"No results found"**
- Try broader search terms (e.g., "laptop" instead of specific model)
- Check spelling of brand names
- Try searching without filters first

---

## Development

### Local Setup

```bash
# Clone the repo
git clone https://github.com/james-webdev/trustrails-mcp-server
cd trustrails-mcp-server

# Install dependencies
npm install

# Run locally
npm run dev
```

### Testing

```bash
# Run the MCP inspector to test tools
npx @modelcontextprotocol/inspector npm run dev
```

---

## Support & Links

- **Website:** [trustrails.app](https://trustrails.app)
- **Issues:** [GitHub Issues](https://github.com/james-webdev/trustrails-mcp-server/issues)
- **NPM:** [@trustrails/mcp-server](https://www.npmjs.com/package/@trustrails/mcp-server)
- **MCP Registry:** [modelcontextprotocol.io/servers](https://modelcontextprotocol.io/servers)

---

## License

MIT © TrustRails

---

## About MCP

This server implements the [Model Context Protocol](https://modelcontextprotocol.io), a standard for connecting AI assistants to external tools and data sources. Learn more about building MCP servers at [modelcontextprotocol.io](https://modelcontextprotocol.io).
