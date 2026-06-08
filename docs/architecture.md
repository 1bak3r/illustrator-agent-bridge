# Architecture

## Components

1. LLM or browser agent
   Sends structured requests. Initially this can be a local HTTP call, a CLI command, or a native MCP tool call.

2. Bridge process
   Validates input, avoids arbitrary code injection, and routes to one of two Illustrator connectors.

3. Agent-facing MCP server
   Exposes this bridge as stdio MCP tools so an LLM client can create JSX jobs or proxy native Illustrator Beta MCP calls.

4. Native MCP connector
   Uses Illustrator Beta's MCP server when available. This is the preferred control plane for direct document operations exposed by Adobe.

5. ExtendScript job connector
   Emits self-contained `.jsx` scripts for regular Illustrator. Jobs write JSON results so the caller can confirm execution.

6. Semantic search layer
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

Agent-facing MCP:

```text
LLM MCP client -> illustrator-agent-bridge stdio MCP -> generated JSX or Illustrator Beta MCP
```

Planned cartoon fallback:

```text
Prompt -> semantic search -> deterministic scene planner -> static QA -> generated scene JSX -> wait result -> export JSX -> wait result -> export artifact QA -> visual inspection
```

## Near-Term Milestones

1. Prove native MCP discovery with `mcp:list-tools` on a machine running Illustrator Beta.
2. Add a small vocabulary of high-level vector commands: create document, create named layer, draw styled shapes, edit text, export PDF/SVG/PNG.
3. Add semantic retrieval for "what is this object/style?" before generating scene plans.
4. Add visual QA: export a PNG, inspect dimensions/nonblank pixels, and iterate before declaring artwork done.
5. Replace the deterministic planner with an LLM planner that still emits the same validated scene contract.
