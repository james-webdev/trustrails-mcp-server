# TrustRails MCP Server

**Search UK electronics products** - compare prices, find deals, and discover products across multiple retailers.

Built for the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) - works with Claude Desktop, Claude Code, and other MCP-compatible AI assistants.

[![npm version](https://badge.fury.io/js/%40trustrails%2Fmcp-server.svg)](https://www.npmjs.com/package/@trustrails/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Quick Start

### Installation

```bash
npm install -g @trustrails/mcp-server
```

### Configuration

**For Claude Code** (`~/.config/claude/config.json`):

```json
{
  "mcpServers": {
    "trustrails": {
      "command": "trustrails-mcp",
      "env": {
        "TRUSTRAILS_API_KEY": "mcp-public-2026"
      }
    }
  }
}
```

**For Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "trustrails": {
      "command": "trustrails-mcp",
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
- Then call `get_product` for full specs when you need details

---

## Available Tools

### `search_products`

Search 26,000+ UK electronics products. Returns summary data (title, price, availability, category). For full technical specs, use `get_product`.

**Parameters:**
- `query` (string) - 1-3 words describing the product type (e.g., "laptop", "headphones", "gaming monitor"). Do not include brand names, prices, or model numbers — use filters instead.
- `min_price` (number, optional) - Minimum price in GBP
- `max_price` (number, optional) - Maximum price in GBP
- `brand` (string, optional) - Filter by brand, exact match (e.g., "Sony", "HP", "Apple")
- `category` (string, optional) - Filter by category: Laptops, Desktops, Tablets, Phones, TVs, Monitors, Headphones, Speakers, Cameras, Keyboards, Mice, Printers, Networking, Storage, Gaming, Wearables, Drones, Audio, Cables & Chargers.
- `lite` (boolean, optional) - Return trimmed product objects (reduces payload by ~80%). Always use for LLM integrations.
- `limit` (number, optional) - Maximum products to return (default 50, max 100)

**Returns:** Up to 50 products with summary data. With `lite: true`, returns only essential fields (id, title, brand, price, availability, image_url, purchase_url).

### `get_product`

Get full details for a single product. Returns complete technical specifications, full description, stock level, delivery time, and retailer source. Use after `search_products` for detailed comparison or recommendations.

**Parameters:**
- `product_id` (string) - The product ID from search results

**Returns:** Complete product with all specs, description, and retailer information

---

## Supported Retailers

Search across **26,000+ electronics products** from major UK retailers including AO, with new retailers added regularly.

---

## Example Usage

**Budget shopping:**
```
"Find gaming laptops under £800"
→ query='gaming laptop', category='Laptops', max_price=800, lite=true
```

**Brand search:**
```
"I need Sony headphones under £200"
→ query='headphones', brand='Sony', max_price=200, lite=true
```

**Category browsing:**
```
"Show me cheap monitors"
→ query='monitor', category='Monitors', max_price=200, lite=true
```

**Detailed specs:**
```
"Tell me the full specs of this laptop"
→ get_product(product_id) — returns full technical specifications
```

**Price range:**
```
"Apple products between £500 and £1000"
→ brand='Apple', min_price=500, max_price=1000, lite=true
```

---

## Rate Limits

- **20 requests per hour** per IP address
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

**"Command not found: trustrails-mcp"**
- Make sure you installed globally: `npm install -g @trustrails/mcp-server`
- Check your global npm bin path is in $PATH: `npm bin -g`

**"Rate limit exceeded"**
- Wait an hour for limits to reset
- Check `X-RateLimit-Reset` header for exact reset time
- 20 requests/hour is plenty for normal usage

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
