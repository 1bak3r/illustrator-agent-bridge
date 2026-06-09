# Architecture

## Components

1. LLM or browser agent
   Sends structured requests. Initially this can be a local HTTP call, a CLI command, or a native MCP tool call.

2. Bridge process
   Validates input, avoids arbitrary code injection, and routes to one of two Illustrator connectors.

3. Browser dashboard
   Serves a local control surface at `/dashboard` for prompt-to-workflow execution, job status checks, and export QA through the same HTTP API.

4. Agent-facing MCP server
   Exposes this bridge as stdio MCP tools so an LLM client can create JSX jobs or proxy native Illustrator Beta MCP calls.

5. Native MCP connector
   Uses Illustrator Beta's MCP server when available. This is the preferred control plane for direct document operations exposed by Adobe.

6. ExtendScript job connector
   Emits self-contained `.jsx` scripts for regular Illustrator, asks the desktop to open them when configured, and reads JSON results so the caller can confirm execution.

7. Semantic search layer
   Planned retrieval layer for visual references, object semantics, style guides, and publication constraints. Retrieval should feed the planning step before commands are sent to Illustrator.

## Command Flow

Native MCP:

```text
LLM -> bridge CLI/MCP client -> Illustrator Beta MCP server -> active Illustrator document
```

ExtendScript fallback:

```text
LLM -> bridge HTTP/CLI/MCP -> validated command -> generated .jsx -> desktop launch or manual run -> Illustrator -> result JSON
```

Agent-facing MCP:

```text
LLM MCP client -> illustrator-agent-bridge stdio MCP -> generated JSX or Illustrator Beta MCP
```

Browser dashboard:

```text
Browser agent -> local dashboard -> bridge HTTP API -> workflow execution or job status
```

Cartoon fallback:

```text
Prompt -> semantic search -> deterministic or OpenAI scene planner -> static QA -> generated scene JSX -> launch/manual run -> wait result -> export JSX -> launch/manual run -> wait result -> export artifact QA -> visual inspection
```

The executor path wraps that sequence for agents:

```text
execute_cartoon_publication_workflow / workflow:execute-cartoon -> prepare workflow -> launch scene -> wait scene -> launch export -> wait export -> artifact QA
```

## Near-Term Milestones

1. Prove native MCP discovery with `mcp:list-tools` on a machine running Illustrator Beta.
2. Add a small vocabulary of high-level vector commands: create document, create named layer, draw styled shapes, edit text, export PDF/SVG/PNG.
3. Add semantic retrieval for "what is this object/style?" before generating scene plans.
4. Add visual QA: export a PNG, inspect dimensions/nonblank pixels, and iterate before declaring artwork done. The bridge now performs PNG nonblank pixel checks; iteration is the next layer.
5. Expand the optional OpenAI planner with stronger art-direction prompts, regression examples, and visual iteration. The first LLM path now emits the same validated scene contract as the deterministic planner.
