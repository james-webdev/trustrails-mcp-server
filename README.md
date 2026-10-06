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
- Purchase links (trustrails.app/go/ redirects to the retailer, through an affiliate link)
- Every known structured spec (`attributes`), so products can be compared from the search alone
- Then `get_product` for your final 1-3 picks, only when you need what search lacks: the retailer's description, or every retailer's offer and buy link (search carries only the best offer's `purchase_url`, cheapest in stock)

---

## Available Tools

### `search_products`

Search 26,000+ UK electronics products across 7 retailers with price comparison. Prices are in GBP. The tool text tells the assistant to split the request into filters first: brand, category and price go in their own arguments, RAM, storage, screen size, resolution, refresh rate, wattage and Wi-Fi generation go in `constraints`, and only what is left over goes in `query`.

**Parameters:**
- `query` (string, optional) - Refinement terms ONLY: model lines, series, variants, model numbers (e.g. 'neo', 'ultra', 'oled', 'WH-1000XM5', 's25 ultra'). Never a category name (BAD query='tablet', query='smartwatch', query='laptop': set the category filter instead), never a brand name (BAD query='Sony': set the brand filter instead), never a price. Omit entirely when browsing a category or brand: 'show me tablets' = category='Tablets', no query. Query words must appear in the title, except words naming the category ('router' in Networking) and bare numbers or specs ('4070', '16GB'), which are ignored when finding products and only rank them. Put a model number with its prefix ('RTX 4070', not '4070') and check each title for it. Leave out use-case words like gaming, cheap or best.
- `min_price` (number, optional) - Minimum price in GBP.
- `max_price` (number, optional) - Maximum price in GBP.
- `brand` (string, optional) - Filter by brand name (exact match, case-insensitive). Examples: Apple, Samsung, Sony, HP, Dell, Lenovo, Anker, Bose, LG
- `category` (string, optional) - Filter by product category. Use ONLY these exact values: Laptops, Desktops, Tablets, Phones, TVs, Monitors, Headphones, Speakers, Cameras, Keyboards, Mice, Printers, Networking, Storage, Gaming, Wearables, Drones, Audio, Cables & Chargers. 'Smartphones' is not valid (use 'Phones'), nor is 'Televisions' (use 'TVs'). Gaming headsets are category='Headphones', query='gaming headset': the Gaming category is consoles, controllers and accessories only.
- `constraints` (object, optional) - Hard spec requirements, checked per product against its `attributes`. Shape `{name: {op: number}}` with op `eq`, `gte` or `lte`; a range is `{gte, lte}`. On every operator, storage matches within 3% and screen size within 0.5 inch; a whole-number screen size N also covers up to N+1 on `eq` and `lte` (`gte` is unchanged); other specs exactly: `gte 1024` accepts a 1TB drive, `eq 22` a 21.5" screen, `eq 13` a 13.6" one, `lte 15` a 15.6" one. Example: `{"memory_gb": {"gte": 24}, "storage_gb": {"gte": 1000}, "screen_in": {"eq": 15}}`. Names and units: `memory_gb` (RAM, GB), `storage_gb` (GB, 1TB = 1000), `screen_in` (inches), `resolution_p` (pixels high: 4K = 2160, QHD = 1440, Full HD = 1080), `refresh_hz` (Hz), `power_w` (W), `wifi_gen` (Wi-Fi generation: 6, 6E = 6.5, 7). A spec written in `query` counts only when it says what it is ('24GB RAM', '1TB', '144Hz', '55"') and means at least, except screen size (that size); a bare '24GB' stays a search word. Explicit constraints win over it. A plain `16GB` or `65W` is `gte`; use `eq` only when the user says exactly, and for screen size. Always set `category` (and brand if known) with constraints: a search of only specs is rejected, as is a bad request (unknown name or operator, negative value, a combination nothing can meet such as `gte` above `lte`); the error lists the valid ones. See [Structured specs](#structured-specs).
- `lite` (boolean, optional) - Return trimmed product objects with only essential fields (id, title, brand, price, currency, availability, image_url, purchase_url, offer_count, attributes (every known spec as {status, value}, without sources) and, with constraints, constraint_status). Always set to true; it still carries attributes. Use false only for ean, category, provenance or all sources at once.
- `limit` (number, optional) - Maximum number of products to return (default 50, max 100)
- `sort` (string, optional) - Sort order: 'relevance' (default), 'price_asc' (in stock first, then cheapest), 'price_desc' (in stock first, then most expensive). With constraints, matched products still come first.

**Returns:** `products` and a `total`. Each product carries every known `attributes` spec (a product with no `attributes` key has none of these seven specs known: say so only if the user asked about one): compare specs from these. State the value of a `confirmed` or `inferred` spec; only `conflicting` (retailers disagree) or a missing name (unknown) needs a caveat. With constraints, each product has `constraint_status` per name (`matched`: a retailer's title states a value that meets it; `unverified`: not known to meet it, so never treat it as a match), `total` counts the products that match every constraint, `unverified_total` the unverified ones that passed the other filters, and `excluded_by_constraints` the products whose stated value fails. `candidates_truncated: true` means the first 2,000 candidates in the chosen sort order were checked and more exist: add a brand or category, or a narrower query, and search again. `availability` is `in_stock`, `low_stock`, `out_of_stock` or `unknown` (the retailer gave no stock signal), and with `purchase_url` and `price` it comes from the product's best offer: in stock first, then cheapest. If `offer_count` is above 1, call `get_product` for your final 1-3 picks to compare retailers. Before claiming a saving, read `offers[].title` (from `get_product`): they must name the same model; if they differ, don't claim one. Before recommending any pick, check its title is the product type asked for (not a cable, accessory or adapter).

### `get_product`

Get full details for a single product by ID. Returns structured `attributes` (see [Structured specs](#structured-specs)), `specs.description` (the retailer's own prose, for processor, GPU, ports, weight, battery and features that `attributes` does not cover), pricing, availability, delivery time, and all retailer offers with per-retailer pricing (`offers[].stock` is a unit count only when the retailer supplies one, otherwise null). Accepts both canonical product IDs and original retailer offer IDs. Use after `search_products` only for your final 1-3 picks, and only when you need what search lacks: details only the description has (if it doesn't give a detail, tell the user it isn't listed), or every retailer's offer and buy link (search carries only the best offer's `purchase_url`, cheapest in stock). Search results already carry `attributes` to compare specs. A pick with `offer_count` 1 needs no call unless the user asked for a description-only detail.

**Parameters:**
- `product_id` (string) - The unique product ID from search results

**Returns:** Complete product with structured `attributes`, `specs` (including the retailer's `specs.description`), `offers` sorted in stock first then cheapest, and provenance information

### Structured specs

Search results and `get_product` return `attributes`: structured specs (RAM, storage, screen size, resolution, refresh rate, power, Wi-Fi generation) read from retailer titles when the catalogue is imported. Each has a `status`, and a spec nobody states is absent (unknown); a product with no `attributes` key has none of these seven specs known (say so only if the user asked about one). What each call returns:

| Call | Returns |
|------|---------|
| `search_products` with `lite=true` (what agents should always set) | `id`, `title`, `brand`, `price`, `currency`, `availability`, `image_url`, `purchase_url`, `offer_count`, every known attribute as `{status, value}` (or `{status, values}` when conflicting) without sources, and `constraint_status` when constrained |
| `search_products` without `lite` | the lite fields plus `ean`, `category`, `product_type`, `provenance` and every attribute with its `sources` |
| `get_product` | everything, including `specs.description` and dimensions, `offers` and `delivery_time` |

Names and units are as in `constraints`. State the value for `confirmed` and `inferred`; only `conflicting` or a missing name needs a caveat. The statuses:

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

Searches with constraints return the constraints applied, `excluded_by_constraints`, `unverified_total`, and a `constraint_status` on each product: `matched` (a retailer's title states a value that meets the constraint) or `unverified` (not known to meet it: never treat as a match, tell the user it is unconfirmed; check `attributes[name]`, where `conflicting` means retailers disagree and missing means unknown). Products whose stated value fails a constraint are left out. A lite result carries the `status` and value of every known spec, without `sources`, so a 64GB laptop is told apart from a 16GB one and disagreeing from unknown.

- **Tolerance:** storage within 3% (1TB = 1000–1024GB) and screen size within 0.5 inch, on every operator. Retailers round sizes down, so a whole-number screen size N also covers up to N+1 on `eq` and `lte` (`eq 13` accepts 13.6", `lte 15` accepts 15.6", `gte` is unchanged). Other specs, memory included, are exact.
- **Specs in `query`:** only a spec that says what it is counts ("24GB RAM", "1TB", "512GB SSD", "144Hz", `55"`). A bare "24GB" stays a search word. Memory, storage, resolution, refresh rate, power and Wi-Fi mean at least; screen size means that size.
- **With only specs:** a search with no category, brand or search words is rejected rather than checking an arbitrary 2,000 products. If a requirement is ambiguous (a bare "16GB" could be RAM or storage), ask the user or search without that constraint.
- **`total`:** with constraints it counts the products that match every constraint, and `unverified_total` the unverified products that passed the other filters (only some may be in `products`). Without constraints `total` is every product matching the filters.
- **Candidate window:** constraints are checked on the first 2,000 candidates in the chosen sort order. If more exist, the response has `candidates_truncated: true`: add a `brand` or `category`, or a narrower `query`, and search again before concluding that nothing matches. If the search was already narrowed, the results may be incomplete.

---

## Supported Retailers

Search across **26,000+ electronics products** from major UK retailers including AO, with new retailers added regularly.

---

## Example Usage

**Budget shopping:**
```
"Find laptops with at least 16GB RAM under £800"
→ category='Laptops', constraints={"memory_gb": {"gte": 16}}, max_price=800, sort='price_asc', lite=true
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
→ compare specs from search; get_product(product_id) only for description-only details or every offer
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
- ✅ **Purchase links** - Click through to the retailer to buy (affiliate links)
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
