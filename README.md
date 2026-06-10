# WordPress SEO MCP Server

An MCP (Model Context Protocol) server that connects AI assistants to WordPress sites for automated SEO optimization. Works with opencode, Claude Code, Cursor, and any MCP-compatible AI.

## Features

| Tool | What it does |
|------|-------------|
| `manage-sites` | Add/list/remove WordPress sites |
| `analyze-seo` | Check meta title, description, OG, Twitter tags |
| `apply-seo` | Fix missing/short/long meta tags |
| `analyze-schema` | Inspect JSON-LD structured data |
| `apply-schema` | Inject Article, Organization, BreadcrumbList schema |
| `analyze-content` | Check headings, word count, keyword usage |
| `analyze-images` | Check alt text, lazy loading |
| `analyze-technical` | Check canonical URL, robots, hreflang |
| `generate-sitemap` | Generate XML sitemap (optionally submit to Google) |
| `suggest-keywords` | Generate keyword ideas for a topic |
| `search-analytics` | Google Search Console analytics (if configured) |
| `rollback-seo` | Undo last SEO changes |
| `get-seo-history` | View change history |

### Architecture

```
AI Assistant → MCP Protocol → Middleware Pipeline → Plugin System → WordPress REST API
                                  ├─ Logging          ├─ Meta Plugin
                                  ├─ Auth             ├─ Schema Plugin
                                  ├─ Validation       ├─ Content Plugin
                                  ├─ Rate Limit       ├─ Images Plugin
                                  └─ Cache            ├─ Technical Plugin
                                                       ├─ Sitemap Plugin
                                                       ├─ Keyword Plugin
                                                       └─ Integration Plugin
```

Plugin-based with SQLite audit log (enables rollback) and optional Google Search Console + PageSpeed integration.

## Quick Start

### Prerequisites
- Node.js 18+
- A WordPress site with REST API enabled and an [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/)

### Install

```bash
git clone https://github.com/abnormal-yi/wordpress-seo-mcp.git
cd wordpress-seo-mcp
npm install
npm run build
```

### Configure in opencode.jsonc

```jsonc
{
  "mcp": {
    "wordpress-seo-mcp": {
      "type": "local",
      "command": ["node", "/path/to/wordpress-seo-mcp/dist/index.js"],
      "enabled": true,
      "environment": {}
    }
  }
}
```

Restart your AI assistant. The server starts automatically and exposes all tools.

### Usage Workflow

```
Step 1: Add your site
  → manage-sites({ action: "add", name: "my-site", config: { url, username, appPassword } })

Step 2: Analyze a page
  → analyze-seo({ site: "my-site", postId: 42 })
  → analyze-content({ site: "my-site", postId: 42, keyword: "seo tools" })
  → analyze-schema({ site: "my-site", postId: 42 })

Step 3: Apply fixes
  → apply-seo({ site: "my-site", postId: 42, fixes: ["missing-title", "missing-desc"] })
  → apply-schema({ site: "my-site", postId: 42, schemas: ["Article", "Organization"] })

Step 4: Generate sitemap
  → generate-sitemap({ site: "my-site" })

Step 5: Roll back if needed
  → rollback-seo({ site: "my-site", postId: 42 })
```

### Or just tell your AI:
> "Optimize this WordPress page for SEO"

The AI runs the full pipeline automatically.

## Google Search Console (optional)

Set these environment variables in your MCP config:

```jsonc
"environment": {
  "GSC_API_KEY": "your-google-api-key",
  "GSC_SITE_URL": "https://yoursite.com"
}
```

Enables `search-analytics` tool and sitemap submission to GSC.

## Development

```bash
npm run dev        # Watch mode
npm test           # Run tests (70+ tests)
npm run typecheck  # TypeScript check
npm run build      # Production build
```

## Project Structure

```
src/
├── index.ts                    # Entry point — wires plugins + services
├── transport.ts                # MCP stdio transport
├── orchestrator.ts             # Tool registry + plugin interface
├── middleware/pipeline.ts      # Middleware pipeline runner
├── plugins/
│   ├── management.ts           # manage-sites tool
│   ├── meta/                   # Meta tag analyzer + applier
│   ├── schema/                 # JSON-LD analyzer + applier
│   ├── content/                # Content SEO analyzer
│   ├── images/                 # Image SEO analyzer
│   ├── technical/              # Technical SEO analyzer
│   ├── sitemap/                # XML sitemap generator
│   ├── keyword/                # Keyword suggestion engine
│   ├── rollback.ts             # Rollback + history tools
│   └── integration/            # GSC + PageSpeed tools
├── services/
│   ├── wordpress/              # REST API client + site pool
│   ├── storage/                # SQLite audit log
│   └── external/               # GSC + PageSpeed API adapters
└── types/                      # Shared type definitions
```
