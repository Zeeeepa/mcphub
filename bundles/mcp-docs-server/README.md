# MCP Docs Server MCPB Bundle

Lightweight MCP server for local documentation access and search.

## Overview

MCP Docs Server provides AI assistants with direct access to your local documentation files. It reads markdown files and exposes their contents through powerful search and overview tools.

Perfect for:
- Project documentation
- Technical specifications
- Knowledge bases
- Architecture documents
- API references

## Features

### Tools (2 total)
- **`search_context(query)`**: Search through documentation for specific topics or keywords
- **`get_context_overview()`**: List all available top-level sections in the documentation

### Capabilities
- Parses markdown files into searchable sections
- Fast full-text search across all documentation
- Section-based organization
- Context-aware search results
- No external dependencies beyond Python MCP SDK

## Installation

### Prerequisites
- Python >= 3.11
- pip

### Install Python MCP SDK

```bash
pip install mcp[cli]>=1.2.0
```

## Configuration

### Environment Variables

**Required Configuration:**
- `CONTEXT_FILE`: Path to your markdown documentation file

**Optional:**
- `LOG_LEVEL`: Logging verbosity (default: info)

### User Configuration

When using this bundle, you'll need to provide:

1. **context_file** (required): Path to your `context.md` file
   - Example: `/Users/yourname/projects/myproject/context.md`
   - The file should be a markdown file with sections marked by `# headers`

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "docs-server": {
      "command": "python3",
      "args": ["/path/to/bundle/server/mcp_context_server.py"],
      "env": {
        "CONTEXT_FILE": "/path/to/your/context.md"
      }
    }
  }
}
```

### Cursor Configuration

Add to your MCP settings:

```json
{
  "docs-server": {
    "command": "python3",
    "args": ["/path/to/bundle/server/mcp_context_server.py"],
    "env": {
      "CONTEXT_FILE": "/path/to/your/context.md"
    }
  }
}
```

## Creating Your Documentation File

Create a `context.md` file with markdown sections:

```markdown
# Introduction

This is the introduction to your project.

# Architecture

## Overview
Your architecture details here...

## Components
Component descriptions...

# API Reference

## Authentication
Authentication details...

## Endpoints
Endpoint documentation...

# Development Guide

Setup instructions and development workflows...
```

### Documentation Structure Tips

1. **Use top-level headers (`#`)** for main sections
2. **Keep sections focused** on specific topics
3. **Include code examples** where relevant
4. **Update regularly** to keep information current
5. **Use clear, searchable keywords** in section titles

## Usage

Once configured, you can:

### Get Documentation Overview
```
What documentation sections are available?
```

The server will list all top-level sections from your context.md file.

### Search Documentation
```
Search the documentation for authentication
```

The server will search across all sections and return relevant matches with context.

### Example Queries
- "How do I set up the development environment?"
- "What are the API authentication requirements?"
- "Show me information about the database schema"
- "What testing frameworks do we use?"

## Troubleshooting

### Context file not found
**Error**: `WARNING: Context file not found at /path/to/context.md`

**Solution**: Ensure the `CONTEXT_FILE` path is correct and the file exists.

### Python version error
**Error**: `SyntaxError` or version-related errors

**Solution**: Ensure you're using Python 3.11 or higher:
```bash
python3 --version
```

### MCP library not found
**Error**: `FATAL ERROR: 'mcp' library not found`

**Solution**: Install the MCP library:
```bash
pip install mcp[cli]>=1.2.0
```

### No search results
**Issue**: Search returns no results even though content exists

**Solution**: 
- Check that your search terms match text in the documentation
- Verify the context.md file has been properly loaded (check server logs)
- Try broader search terms

## File Structure

```
mcp-docs-server/
├── manifest.json              # MCPB manifest configuration
├── LICENSE                    # MIT License (UnlockMCP)
├── README.md                 # This file
└── server/
    └── mcp_context_server.py # Python MCP server implementation
```

## Compatibility

- **Platforms**: macOS, Windows, Linux
- **Python**: >= 3.11
- **License**: MIT (UnlockMCP)

## Links

- **Original Repository**: https://github.com/Unlock-MCP/mcp-docs-server
- **MCP SDK**: https://github.com/modelcontextprotocol/python-sdk
- **Issues**: https://github.com/Unlock-MCP/mcp-docs-server/issues

## Attribution

This bundle is based on the MCP Docs Server by UnlockMCP, licensed under MIT.
Original source: https://github.com/Unlock-MCP/mcp-docs-server

## Support

For issues or questions:
- Check the troubleshooting section above
- Visit the [original repository](https://github.com/Unlock-MCP/mcp-docs-server/issues)
- Ensure your Python version and MCP SDK are up to date

