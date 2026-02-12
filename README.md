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

```
"Find me a gaming laptop under £1000"
"Compare prices for gaming laptops across retailers"
"Show me the cheapest 4K monitors over 27 inches"
"What HP laptops are in stock right now between £500-£700?"
```

Claude will search across multiple UK retailers and show you:
- Real-time prices & availability
- Product specs & descriptions
- Stock status
- Direct purchase links

---

## Available Tools

### `search_products`

Search UK electronics across major UK retailers including AO.

**Parameters:**
- `query` (string) - Search term (e.g., "laptop", "USB-C charger")
- `min_price` (number, optional) - Minimum price in GBP
- `max_price` (number, optional) - Maximum price in GBP
- `brand` (string, optional) - Filter by brand (e.g., "Sony", "HP", "Apple")
- `category` (string, optional) - Filter by category (e.g., "Laptops", "Headphones")
- `lite` (boolean, optional) - Return trimmed product objects (reduces payload by ~80%). Recommended for ChatGPT and other LLMs.
- `limit` (number, optional) - Maximum products to return (default 20, max 100)

**Returns:** Up to 20 products (or `limit`) with full details (title, price, specs, availability, purchase links). With `lite: true`, returns only essential fields.

### `get_product`

Get detailed information about a specific product by ID.

**Parameters:**
- `product_id` (string) - The product ID from search results

**Returns:** Complete product information including specifications and retailer details

---

## Supported Retailers

Search across **26,000+ electronics products** from major UK retailers including **AO**, with new retailers added regularly.

---

## Example Usage

**Price comparison:**
```
"Compare prices for gaming laptops across all retailers"
```

**Budget shopping:**
```
"Find the cheapest gaming laptops with at least 16GB RAM under £800"
```

**Brand research:**
```
"Show me all Apple products between £500 and £1000 currently in stock"
```

**Stock checking:**
```
"Which retailers have the HP Envy x360 in stock right now?"
```

**Deal finding:**
```
"What are the best laptop deals under £600 from any retailer?"
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
