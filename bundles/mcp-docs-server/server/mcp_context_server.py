#!/usr/bin/env python3
"""
MCP Context Server

A lightweight MCP server that provides direct access to local documentation files.
Reads a markdown file and exposes its contents through search and overview tools.

Original source: https://github.com/Unlock-MCP/mcp-docs-server
Copyright (c) 2025 UnlockMCP
Licensed under MIT License (see LICENSE file)
"""

import sys
import re
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    print(
        "FATAL ERROR: 'mcp' library not found. Install with: pip install mcp[cli]>=1.2.0",
        file=sys.stderr
    )
    sys.exit(1)

# Configuration - support environment variable or default location
CONTEXT_FILE_PATH = os.environ.get('CONTEXT_FILE', str(Path(__file__).parent.parent / "context.md"))
CONTEXT_FILE = Path(CONTEXT_FILE_PATH)

# Initialize FastMCP server
mcp = FastMCP(
    "docs-server",
    description="A server to access and search project documentation from markdown files."
)

class ContextParser:
    """Parses markdown documentation and provides search/overview functionality."""
    
    def __init__(self, file_path: Path):
        self.file_path = file_path
        self.sections: Dict[str, str] = {}
        self._load_and_parse()
    
    def _load_and_parse(self) -> None:
        """Load the markdown file and parse it into sections."""
        try:
            if not self.file_path.exists():
                print(f"WARNING: Context file not found at {self.file_path}", file=sys.stderr)
                self.sections = {"Error": "Documentation file not found. Please create context.md in the project root."}
                return
            
            content = self.file_path.read_text(encoding='utf-8')
            print(f"Loaded context file: {self.file_path} ({len(content)} chars)", file=sys.stderr)
            
            # Split content by top-level headers (# Title)
            sections = re.split(r'^# ', content, flags=re.MULTILINE)
            
            if len(sections) > 1:
                # First section is content before any headers (if any)
                if sections[0].strip():
                    self.sections["Introduction"] = sections[0].strip()
                
                # Process remaining sections
                for section in sections[1:]:
                    lines = section.split('\n', 1)
                    if len(lines) >= 1:
                        title = lines[0].strip()
                        content_part = lines[1] if len(lines) > 1 else ""
                        self.sections[title] = content_part.strip()
            else:
                # No headers found, treat entire content as one section
                self.sections["Documentation"] = content.strip()
            
            print(f"Parsed {len(self.sections)} sections", file=sys.stderr)
        
        except Exception as e:
            print(f"ERROR loading context file: {e}", file=sys.stderr)
            self.sections = {"Error": f"Failed to load documentation: {str(e)}"}
    
    def get_overview(self) -> str:
        """Return an overview of all available sections."""
        if not self.sections:
            return "No documentation sections available."
        
        overview = "Available documentation sections:\n\n"
        for i, title in enumerate(self.sections.keys(), 1):
            overview += f"{i}. {title}\n"
        
        return overview
    
    def search(self, query: str) -> str:
        """Search for a query across all sections."""
        if not self.sections:
            return "No documentation available to search."
        
        query_lower = query.lower()
        results: List[Tuple[str, str]] = []
        
        # Search in section titles first
        for title, content in self.sections.items():
            if query_lower in title.lower():
                results.append((title, f"Found in section title: {title}"))
        
        # Search in content
        for title, content in self.sections.items():
            if query_lower in content.lower():
                # Find context around the match
                lines = content.split('\n')
                matching_lines = []
                
                for line in lines:
                    if query_lower in line.lower():
                        matching_lines.append(line.strip())
                
                if matching_lines:
                    context = '\n'.join(matching_lines[:3])  # First 3 matches
                    results.append((title, f"From '{title}' section:\n{context}"))
        
        if not results:
            return f"No results found for '{query}' in the documentation."
        
        # Format results
        response = f"Search results for '{query}':\n\n"
        for i, (title, context) in enumerate(results[:5], 1):  # Limit to 5 results
            response += f"{i}. {context}\n\n"
        
        if len(results) > 5:
            response += f"... and {len(results) - 5} more results found.\n"
        
        return response


# Initialize the parser
print("Initializing context parser...", file=sys.stderr)
context_parser = ContextParser(CONTEXT_FILE)


@mcp.tool()
async def search_context(query: str) -> str:
    """
    Search through the documentation for specific topics or keywords.
    
    Args:
        query: The search term or phrase to look for
    
    Returns:
        Matching content from the documentation
    """
    print(f"Searching for: {query}", file=sys.stderr)
    return context_parser.search(query)


@mcp.tool()
async def get_context_overview() -> str:
    """
    List all available top-level sections in the documentation.
    
    Returns:
        An overview of all documentation sections
    """
    print("Getting context overview", file=sys.stderr)
    return context_parser.get_overview()


if __name__ == "__main__":
    print("Starting MCP context server...", file=sys.stderr)
    print(f"Serving documentation from: {CONTEXT_FILE}", file=sys.stderr)
    mcp.run()

