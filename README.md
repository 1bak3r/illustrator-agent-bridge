# Illustrator Agent Bridge

Early bridge for connecting an LLM or browser agent to Adobe Illustrator, with two execution paths:

- Native Illustrator Beta MCP: preferred when the latest Illustrator Beta MCP server is available.
- ExtendScript job files: fallback for regular Illustrator installs and for deterministic vector-art generation.

The first practical goal is communication, not autonomous art direction. The bridge can discover/call Illustrator MCP tools, or generate `.jsx` jobs that Illustrator can run and report back through a JSON result file.

## Quick Start

```bash
npm install
npm run build
npm run illustrator:detect
node dist/src/cli.js illustrator:probe --method com --draw-circle --wait
npm run jsx:ping
npm run jsx:cartoon
npm run semantic:search -- "cartoon lab flask"
npm run plan:cartoon -- "cartoon lab scientist with flask"
npm run plan:cartoon -- "cartoon lab scientist with flask" -- --planner auto
npm run workflow:cartoon -- "cartoon lab scientist with flask" --output ./var/exports/figure.pdf
npm run workflow:execute-cartoon -- "cartoon lab scientist with flask" --output ./var/exports/figure.svg --format svg --dry-run
```

Optional LLM planning uses the OpenAI Responses API with Structured Outputs, then validates the returned scene through the same bridge contract before writing JSX:

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_MODEL="gpt-5.5"
npm run plan:cartoon -- "cartoon lab scientist with flask" -- --planner openai
```

The `jsx:*` commands write jobs under `var/jobs/` and expected results under `var/results/`. In Illustrator, run a generated job with `File > Scripts > Other Script`, then inspect the matching result JSON.
On Windows or WSL, the quickest no-API communication proof is COM automation:

```bash
node dist/src/cli.js illustrator:detect
node dist/src/cli.js illustrator:probe --method com --draw-circle --wait --timeout-ms 30000
```

That command creates a JSX scene with one Illustrator vector circle, executes it through `Illustrator.Application.DoJavaScriptFile`, then waits for Illustrator to write `var/results/<job-id>.json` with `ok=true`.

When the host OS has a JSX file association, or when you pass an Illustrator app name/path, the bridge can also ask the desktop to open the job:

```bash
node dist/src/cli.js job:launch <job-id> --dry-run --platform macos --app "Adobe Illustrator"
node dist/src/cli.js job:launch <job-id> --platform macos --app "Adobe Illustrator"
```

Desktop JSX launch may show Adobe's external-script warning. Use `illustrator:probe --method desktop --auto-confirm-dialog --draw-circle --wait` only when you need to test that route; COM is preferred on Windows/WSL because it bypasses the warning dialog.

After a document exists in Illustrator, generate an export job:

```bash
npm run jsx:export -- --format pdf --output ./var/exports/figure.pdf
```

Check or wait for a job result after the JSX has been run in Illustrator:

```bash
node dist/src/cli.js job:status <job-id>
node dist/src/cli.js job:wait <job-id> --timeout-ms 60000
```

Run structural and PNG visual QA on the exported file:

```bash
node dist/src/cli.js qa:export ./var/exports/figure.png --format png --min-width 360 --min-height 240 --min-nonblank-ratio 0.001
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

Then open `http://127.0.0.1:4317/dashboard` for the local browser control surface.

Expose the bridge itself as an MCP server over stdio:

```bash
npm run mcp:serve
```

That server exposes tools to create Illustrator JSX jobs and to proxy Illustrator Beta MCP calls when `ILLUSTRATOR_MCP_URL` and `ILLUSTRATOR_MCP_TOKEN` are configured.
It also exposes `semantic_search_visual_knowledge` so an agent can retrieve object semantics and publication constraints before mutating Illustrator.
Use `detect_illustrator_desktop` and `probe_illustrator_communication` first to prove local no-key Illustrator communication. On Windows/WSL, pass `method: "com"`, `drawCircle: true`, and `waitForResult: true` to prove Illustrator can draw a circle and report completion.
Use `plan_cartoon_scene_job` for the current one-call fallback workflow: prompt -> semantic evidence -> scene plan -> static QA -> generated Illustrator JSX.
Use `prepare_cartoon_publication_workflow` when the agent needs both a scene job and a follow-up export job with an ordered runbook.
Use `execute_cartoon_publication_workflow` when the agent should prepare that workflow, launch scene/export JSX jobs, wait for results, and run export artifact QA. Pass `dryRun: true` first to verify the launch commands.
Use `bridge_launch_job` to open a generated JSX job from an MCP client, then `bridge_wait_for_job_result` to prove Illustrator wrote the result JSON.
Use `qa_export_artifact` after export to check file size, format signature, dimensions, SVG/PDF structure, and PNG nonblank pixel content.

The planner defaults to `deterministic`. Set `--planner auto` or pass `planner: "auto"` to use the OpenAI planner when `OPENAI_API_KEY` is configured, with deterministic fallback when it is not. Set `--planner openai` to require OpenAI planning. `OPENAI_MODEL` defaults to `gpt-5.5`, and `OPENAI_BASE_URL` defaults to `https://api.openai.com/v1`. The dashboard exposes the same planner and model controls.

Create a job over HTTP:

```bash
curl -sS http://127.0.0.1:4317/v1/jobs \
  -H 'content-type: application/json' \
  -d '{"kind":"ping","message":"hello Illustrator"}'
```

Launch a generated job over HTTP:

```bash
curl -sS http://127.0.0.1:4317/v1/jobs/<job-id>/launch \
  -H 'content-type: application/json' \
  -d '{"dryRun":true,"platform":"macos","appPath":"Adobe Illustrator"}'
```

Execute a cartoon workflow dry-run over HTTP:

```bash
curl -sS http://127.0.0.1:4317/v1/workflows/cartoon/execute \
  -H 'content-type: application/json' \
  -d '{"prompt":"cartoon lab scientist with flask","outputPath":"var/exports/figure.svg","format":"svg","dryRun":true,"platform":"macos"}'
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
