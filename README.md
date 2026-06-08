# Illustrator Agent Bridge

Early bridge for connecting an LLM or browser agent to Adobe Illustrator, with two execution paths:

- Native Illustrator Beta MCP: preferred when the latest Illustrator Beta MCP server is available.
- ExtendScript job files: fallback for regular Illustrator installs and for deterministic vector-art generation.

The first practical goal is communication, not autonomous art direction. The bridge can discover/call Illustrator MCP tools, or generate `.jsx` jobs that Illustrator can run and report back through a JSON result file.

## Quick Start

```bash
npm install
npm run build
npm run jsx:ping
npm run jsx:cartoon
npm run semantic:search -- "cartoon lab flask"
npm run plan:cartoon -- "cartoon lab scientist with flask"
```

The `jsx:*` commands write jobs under `var/jobs/` and expected results under `var/results/`. In Illustrator, run a generated job with `File > Scripts > Other Script`, then inspect the matching result JSON.

After a document exists in Illustrator, generate an export job:

```bash
npm run jsx:export -- --format pdf --output ./var/exports/figure.pdf
```

For the native MCP path, copy the server URL and key from Illustrator Beta `MCP & Tools`, then:

```bash
export ILLUSTRATOR_MCP_URL="http://localhost:18412/v1/mcp"
export ILLUSTRATOR_MCP_TOKEN="replace_with_your_key"
npm run mcp:list-tools
```

Start the local HTTP job bridge for an LLM/browser agent:

```bash
npm start
```

Expose the bridge itself as an MCP server over stdio:

```bash
npm run mcp:serve
```

That server exposes tools to create Illustrator JSX jobs and to proxy Illustrator Beta MCP calls when `ILLUSTRATOR_MCP_URL` and `ILLUSTRATOR_MCP_TOKEN` are configured.
It also exposes `semantic_search_visual_knowledge` so an agent can retrieve object semantics and publication constraints before mutating Illustrator.
Use `plan_cartoon_scene_job` for the current one-call fallback workflow: prompt -> semantic evidence -> scene plan -> static QA -> generated Illustrator JSX.

Create a job over HTTP:

```bash
curl -sS http://127.0.0.1:4317/v1/jobs \
  -H 'content-type: application/json' \
  -d '{"kind":"ping","message":"hello Illustrator"}'
```

## Why This Shape

Adobe documents current Illustrator scripting support through JavaScript/ExtendScript, AppleScript, VBScript, and `File > Scripts`. Adobe also documents a new Illustrator Beta MCP server for tools such as Codex, Claude Code, and Cursor. This repo supports both because the Beta MCP path is the clean future-facing interface, while ExtendScript remains the lowest-friction automation path for installed Illustrator.

Useful references:

- Adobe Illustrator developer page: https://developer.adobe.com/illustrator/
- Install and run scripts in Illustrator: https://helpx.adobe.com/illustrator/desktop/automate-visualize-data/automate-actions/install-and-run-scripts.html
- Illustrator Beta MCP overview: https://helpx.adobe.com/uk/illustrator/desktop/connect-with-other-apps-and-tools/about-using-ai-tools-with-illustrator.html
- Connect Illustrator Beta to AI tools: https://helpx.adobe.com/uk/illustrator/desktop/connect-with-other-apps-and-tools/connect-illustrator-to-ai-tools.html

## Security Notes

Keep the HTTP bridge bound to `127.0.0.1`. Do not commit `.env`, MCP bearer keys, generated jobs, result files, or user artwork.
