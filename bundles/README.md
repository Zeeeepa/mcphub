# MCPB Bundles for mcphub

This directory contains MCPB (Model Context Protocol Bundle) packages that can be installed and used with MCP clients like Claude Desktop, Cursor, and others.

## Available Bundles

### 1. Mercury Spec Ops
**Path**: `mercury-spec-ops/`

Modular MCP server for dynamic prompt generation and software development analysis tools.

**Features**:
- PRD generation with templates
- Codebase analysis for 31 technology stacks
- Bug analysis with severity levels

**Environment Variables**: None required

**Requirements**: Node.js >= 20.0.0

[📖 Full Documentation](./mercury-spec-ops/README.md)

---

### 2. MCP Docs Server
**Path**: `mcp-docs-server/`

Lightweight MCP server for local documentation access and search.

**Features**:
- Markdown documentation parsing
- Full-text search across sections
- Section-based organization

**Environment Variables**:
- `CONTEXT_FILE` (required): Path to your markdown documentation file

**Requirements**: Python >= 3.11

[📖 Full Documentation](./mcp-docs-server/README.md)

---

### 3. MCP Bundler
**Path**: `mcp-bundler/`

Combine multiple MCP servers into a single unified endpoint.

**Features**:
- Multi-server aggregation
- Unified configuration
- Environment variable management
- Multiple transport modes (stdio, SSE, InMemory)

**Environment Variables**: Depends on bundled sub-servers

**Requirements**: Node.js >= 18.0.0

[📖 Full Documentation](./mcp-bundler/README.md)

---

## Quick Start

### Installing a Bundle

Each bundle can be used directly by configuring your MCP client to point to the bundle's server.

#### Example: Mercury Spec Ops in Claude Desktop

Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "mercury-spec-ops": {
      "command": "npx",
      "args": ["-y", "@n0zer0d4y/mercury-spec-ops@latest"]
    }
  }
}
```

#### Example: MCP Docs Server in Cursor

Add to MCP settings:
```json
{
  "docs-server": {
    "command": "python3",
    "args": ["/path/to/bundles/mcp-docs-server/server/mcp_context_server.py"],
    "env": {
      "CONTEXT_FILE": "/path/to/your/context.md"
    }
  }
}
```

## Creating MCPB Packages

Each bundle directory contains a `manifest.json` file following the MCPB specification v0.3.

### Packaging a Bundle

To create a `.mcpb` file from a bundle:

1. **Install MCPB CLI** (if not already installed):
   ```bash
   npm install -g @anthropic-ai/mcpb
   ```

2. **Navigate to bundle directory**:
   ```bash
   cd bundles/mercury-spec-ops
   ```

3. **Pack the bundle**:
   ```bash
   mcpb pack
   ```

This will generate a `.mcpb` file that can be distributed and installed with one click.

## Bundle Structure

Each bundle follows this structure:

```
bundle-name/
├── manifest.json          # MCPB manifest (v0.3 spec)
├── README.md             # Documentation
├── LICENSE               # License file (if applicable)
└── server/               # Server implementation
    ├── index.js          # Node.js entry point, OR
    └── server.py         # Python entry point
```

## Environment Variables Summary

| Bundle | Required Env Vars | Optional Env Vars | Notes |
|--------|------------------|-------------------|-------|
| Mercury Spec Ops | None | None | Works out of the box |
| MCP Docs Server | `CONTEXT_FILE` | `LOG_LEVEL` | Requires path to markdown file |
| MCP Bundler | Varies | Varies | Depends on bundled sub-servers |

## Validation and Testing

### Validate Manifest

Check if a manifest.json is valid:

```bash
cd bundles/your-bundle
mcpb validate manifest.json
```

### Test a Bundle Locally

#### Node.js bundles:
```bash
cd bundles/mercury-spec-ops
npx -y @n0zer0d4y/mercury-spec-ops@latest
```

#### Python bundles:
```bash
cd bundles/mcp-docs-server
python3 server/mcp_context_server.py
```

#### Custom wrapper bundles:
```bash
cd bundles/mcp-bundler/server
npm install
node index.js
```

## MCPB Manifest Specification

All bundles follow the MCPB manifest specification v0.3. Key fields:

- **manifest_version**: "0.3"
- **name**: Machine-readable identifier (kebab-case)
- **version**: Semantic versioning
- **server**: Server configuration (type, entry_point, mcp_config)
- **user_config**: User-configurable parameters
- **compatibility**: Runtime and platform requirements

See individual bundle `manifest.json` files for complete examples.

## Platform Compatibility

All bundles are compatible with:
- **macOS** (darwin)
- **Windows** (win32)
- **Linux**

Specific runtime requirements vary by bundle (see individual READMEs).

## Contributing

When adding new bundles:

1. Create a new directory under `bundles/`
2. Include `manifest.json` following MCPB v0.3 spec
3. Add comprehensive `README.md` with:
   - Overview and features
   - Environment variables (clearly marked as required/optional)
   - Installation and configuration instructions
   - Usage examples
   - Troubleshooting section
4. Include server implementation in `server/` subdirectory
5. Test the bundle locally before committing
6. Update this README with the new bundle

## License

Individual bundles may have different licenses. Check each bundle's LICENSE file.

- **Mercury Spec Ops**: MIT (n0zer0d4y)
- **MCP Docs Server**: MIT (UnlockMCP)
- **MCP Bundler**: MIT (wrtnlabs)

## Links

- **MCPB Specification**: https://modelcontextprotocol.io/bundles
- **MCP Protocol**: https://modelcontextprotocol.io
- **mcphub Repository**: https://github.com/Zeeeepa/mcphub

## Support

For bundle-specific issues, refer to each bundle's README and upstream repository.

For mcphub integration issues, please open an issue in the [mcphub repository](https://github.com/Zeeeepa/mcphub/issues).

