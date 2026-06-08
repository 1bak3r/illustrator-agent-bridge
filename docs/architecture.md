# Architecture

## Components

1. LLM or browser agent
   Sends structured requests. Initially this can be a local HTTP call, a CLI command, or a native MCP tool call.

2. Bridge process
   Validates input, avoids arbitrary code injection, and routes to one of two Illustrator connectors.

3. Native MCP connector
   Uses Illustrator Beta's MCP server when available. This is the preferred control plane for direct document operations exposed by Adobe.

4. ExtendScript job connector
   Emits self-contained `.jsx` scripts for regular Illustrator. Jobs write JSON results so the caller can confirm execution.

5. Semantic search layer
   Planned retrieval layer for visual references, object semantics, style guides, and publication constraints. Retrieval should feed the planning step before commands are sent to Illustrator.

## Command Flow

Native MCP:

```text
LLM -> bridge CLI/MCP client -> Illustrator Beta MCP server -> active Illustrator document
```

ExtendScript fallback:

```text
LLM -> bridge HTTP/CLI -> validated command -> generated .jsx -> Illustrator -> result JSON
```

## Near-Term Milestones

1. Prove native MCP discovery with `mcp:list-tools` on a machine running Illustrator Beta.
2. Add a small vocabulary of high-level vector commands: create document, create named layer, draw styled shapes, edit text, export PDF/SVG/PNG.
3. Add semantic retrieval for "what is this object/style?" before generating scene plans.
4. Add visual QA: export a PNG, inspect dimensions/nonblank pixels, and iterate before declaring artwork done.
