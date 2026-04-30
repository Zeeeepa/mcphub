# Mercury Spec Ops MCPB Bundle

Modular MCP server for dynamic prompt generation and software development analysis tools.

## Overview

Mercury Spec Ops provides intelligent prompt assembly for:
- **PRD Generation**: Product Requirements Documents with comprehensive templates
- **Codebase Analysis**: Deep analysis across 31 technology stacks
- **Bug Analysis**: Systematic bug investigation and severity assessment

## Features

### Prompts (3 total)
- PRD Prompt
- Codebase Analysis Prompt
- Bug Analysis Prompt

### Resources (3 total)
- PRD Template
- Codebase Analysis Template
- Bug Analysis Template

### Supported Technology Stacks (31 total)

**Languages (11)**: JavaScript, TypeScript, Python, Java, Go, Rust, C#, PHP, Ruby, Swift, Kotlin

**Runtimes (1)**: Node.js

**Frontend (3)**: React, Angular, Vue

**Backend (7)**: Express, NestJS, Django, Flask, Spring, Laravel, Rails

**Databases (4)**: MongoDB, PostgreSQL, MySQL, Redis

**Cloud (3)**: AWS, Azure, GCP

**DevOps (2)**: Docker, Kubernetes

### Analysis Focus Areas (10 total)
- architecture
- security
- performance
- testing
- documentation
- maintainability
- scalability
- reliability
- code-quality
- dependencies

### Bug Severity Levels (4 total)
- low
- medium
- high
- critical

## Installation

### Prerequisites
- Node.js >= 20.0.0
- npm or npx

### Quick Install

This bundle uses `npx` to automatically fetch and run the latest version, so no manual installation is required.

## Configuration

### Environment Variables

**None required** - Mercury Spec Ops operates without mandatory environment variables.

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

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

### Cursor Configuration

Add to your MCP settings:

```json
{
  "mercury-spec-ops": {
    "command": "npx",
    "args": ["-y", "@n0zer0d4y/mercury-spec-ops@latest"]
  }
}
```

## Usage

Once configured, Mercury Spec Ops will be available through your MCP client. You can:

1. **Generate PRDs**: Use the PRD prompt to create comprehensive product requirements
2. **Analyze Codebases**: Examine your codebase with focus on specific areas (security, performance, etc.)
3. **Investigate Bugs**: Perform systematic bug analysis with severity classification

## Example Workflows

### Generate a PRD
```
Use the PRD template to create a product requirements document for [your feature]
```

### Analyze Codebase
```
Analyze the codebase focusing on security and performance for a React + Express application
```

### Bug Analysis
```
Analyze this bug with critical severity in the authentication module
```

## Compatibility

- **Platforms**: macOS, Windows, Linux
- **Node.js**: >= 20.0.0
- **License**: MIT

## Links

- **Repository**: https://github.com/n0zer0d4y/mercury-spec-ops
- **NPM Package**: https://www.npmjs.com/package/@n0zer0d4y/mercury-spec-ops
- **Issues**: https://github.com/n0zer0d4y/mercury-spec-ops/issues

## Support

For issues or questions, please visit the [GitHub repository](https://github.com/n0zer0d4y/mercury-spec-ops/issues).

