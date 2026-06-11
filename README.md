# Illustrator Agent Bridge

Early bridge for connecting an LLM or browser agent to Adobe Illustrator, with two execution paths:

- Native Illustrator Beta MCP: preferred when the latest Illustrator Beta MCP server is available.
- ExtendScript job files: fallback for regular Illustrator installs and for deterministic vector-art generation.

The first practical goal is communication, not autonomous art direction. The bridge can discover/call Illustrator MCP tools, or generate `.jsx` jobs that Illustrator can run and report back through a JSON result file.

## Current Status

The bridge has proven no-key Illustrator control on Windows Illustrator from WSL:

- Detects an installed Illustrator desktop app.
- Executes generated JSX through Windows COM with `Illustrator.Application.DoJavaScriptFile`.
- Creates an Illustrator document and draws a named vector circle.
- Creates a multi-element vector probe with polygons, ellipses, lines, text, and curved Bezier paths.
- Can drive the actual Windows mouse against the live Illustrator window from WSL/Windows after measuring and focusing the target window.
- Uses local semantic search to retrieve scientific concepts, visual metaphors, object semantics, and publication constraints before planning complex concept figures.
- Uses shape recipes for concrete objects such as cats, locks, and keys, then runs a local guard that returns a refinement prompt when recognizable parts, spatial grammar, or visual footprint checks fail.
- Can inspect reviewed SVG, AI, EPS, PDF, or saved bridge scene JSON files and convert detected vector shape combinations into searchable `shape_combination` semantic evidence.
- Reads Illustrator's result JSON back from `var/results/`.
- Exposes the same probe through CLI, HTTP dashboard, and MCP tools for an agent/browser workflow.

The proof command is:

```bash
node dist/src/cli.js illustrator:probe --method com --draw-circle --wait --timeout-ms 30000
```

See [docs/communication-proof.md](docs/communication-proof.md) for the concrete verification output and next engineering steps.

## Quick Start

```bash
npm install
npm run build
npm run illustrator:detect
node dist/src/cli.js illustrator:probe --method com --draw-circle --wait
node dist/src/cli.js illustrator:probe --method com --draw-complex --wait --mouse-proof --mouse-action click --timeout-ms 30000
npm run illustrator:mouse -- --action move --x 0.5 --y 0.5 --dry-run
npm run jsx:ping
npm run jsx:cartoon
npm run semantic:search -- "cartoon lab flask"
npm run semantic:search -- "electron transfer membrane" -- --kind scientific_concept
npm run semantic:inspect-vector -- ./examples/cartoon-scene.json
npm run plan:cartoon -- "cartoon lab scientist with flask"
npm run plan:scientific -- "polymer membrane electron transfer catalytic concept"
npm run plan:object -- "full cat icon"
npm run plan:cartoon -- "cartoon lab scientist with flask" -- --planner auto
npm run workflow:cartoon -- "cartoon lab scientist with flask" --output ./var/exports/figure.pdf
npm run workflow:execute-cartoon -- "cartoon lab scientist with flask" --output ./var/exports/figure.svg --format svg --dry-run
npm run workflow:execute-object -- "full cat icon" --output ./var/exports/cat.png --format png --run-mode com --platform wsl --dry-run
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

To prove a more complex vector scene and live mouse control, run a dry mouse proof first:

```bash
npm run illustrator:mouse -- --action move --x 0.5 --y 0.5 --dry-run
node dist/src/cli.js illustrator:probe --method com --draw-complex --wait --mouse-proof --mouse-action click --timeout-ms 30000
```

The mouse driver is intentionally fail-closed: it only runs on Windows/WSL, finds a running Illustrator window, restores and focuses it, measures the window bounds, then moves/clicks/drags using coordinates relative to that window.

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

Plan and execute a complex scientific concept scene:

```bash
npm run semantic:search -- "polymer membrane electron transfer catalytic concept" -- --kind scientific_concept --limit 5
npm run plan:scientific -- "polymer membrane electron transfer catalytic concept"
node dist/src/cli.js job:run-com <job-id> --platform auto
node dist/src/cli.js job:wait <job-id> --timeout-ms 60000
```

The scientific planner performs several semantic searches, activates matching concept modules, generates validated Illustrator vector elements, and writes a JSX job. Use `job:run-com` on Windows/WSL to execute that generated job through `Illustrator.Application.DoJavaScriptFile`.

Plan and guard a concrete object shape:

```bash
npm run semantic:search -- "cat whiskers tail paws" -- --kind shape_recipe
npm run plan:object -- "full cat icon"
npm run plan:object -- "secure padlock icon"
npm run plan:object -- "simple house key icon"
node dist/src/cli.js guard:object cat ./saved-plan-output.json
```

`plan:object` supports `cat`, `lock`, and `key` targets today. It retrieves local shape recipes, learned `shape_combination` evidence, object semantics, style, and publication constraints, then builds a named Illustrator vector scene, runs structural scene QA, and runs the object guard. The guard rejects missing, invisible, or zero-size required parts, incoherent placement, target-word text labels, and object silhouettes that are too small to read. When `plan.guard.ok` is false, feed `plan.guard.nextGoalPrompt` or `plan.guard.nextPrompt` into the next planning call so the agent keeps iterating until the object is recognizable.

Run a guarded object workflow end-to-end:

```bash
npm run workflow:object -- "full cat icon" --output ./var/exports/cat.png --format png
npm run workflow:execute-object -- "full cat icon" --output ./var/exports/cat.png --format png --run-mode com --platform wsl --max-guard-iterations 3 --dry-run
npm run workflow:execute-object -- "secure padlock icon" --output ./var/exports/lock.svg --format svg --run-mode com --platform wsl
```

`workflow:execute-object` can run a bounded guard refinement loop before Illustrator execution. Pass `--max-guard-iterations 3` so each failed guard attempt feeds `workflow.plan.guard.nextGoalPrompt` into the next object-planning pass until the guard passes or the limit is reached. If the final guard still fails, the workflow stops before Illustrator execution and returns the final `nextGoalPrompt`. With `--run-mode com` on Windows/WSL, it runs the scene and export jobs sequentially through Illustrator COM; with default `--run-mode launch`, it uses the regular desktop launch path.

Inspect reviewed vector assets and turn their shape combinations into searchable evidence:

```bash
npm run semantic:inspect-vector -- ./examples/cartoon-scene.json ./path/to/reviewed-artwork.svg
npm run semantic:learn-vector -- ./path/to/reviewed-artwork.svg --corpus ./data/semantic-corpus.json --output ./var/learned-semantic-corpus.json
npm run semantic:search -- "shape combination path circle text" -- --kind shape_combination --corpus ./var/learned-semantic-corpus.json
```

Use this after reviewing Drive-discovered Illustrator/vector assets. `semantic:inspect-vector` is read-only and reports shape counts, named parts, SVG or bridge-scene spatial part relationships, colors, inferred tags, and a semantic item. `semantic:learn-vector` writes a merged corpus file, so keep generated or experimental corpora under `var/` unless you explicitly want to update the committed seed corpus.

### Google Drive Desktop Vector Learning

The hosted Google Drive connector is useful when authenticated, but the bridge can also learn from the local Google Drive Desktop app. On Windows/WSL, inspect Google Drive DriveFS metadata and copy only reviewed vector assets into a generated staging folder under `var/`, then learn shape-combination records from those staged files:

```bash
npm run semantic:inspect-vector -- ./var/drive-vector-search/staged-vector-context --limit 500
npm run semantic:learn-vector -- ./var/drive-vector-search/staged-vector-context \
  --corpus ./data/semantic-corpus.json \
  --output ./var/drive-vector-search/learned-semantic-corpus.json \
  --limit 500
npm run semantic:search -- "SABER powder coating pitch asset" \
  --kind shape_combination \
  --corpus ./var/drive-vector-search/learned-semantic-corpus.json
```

The local Drive workflow should stay reviewed and selective:

- Keep generated manifests, copied vectors, exports, and learned corpora under `var/`.
- Do not commit staged Google Drive artwork, generated corpora, result JSON, or exported user artwork.
- Prefer small scientific, figure, pitch, or design assets; exclude legal, tax, finance, invoice, HR, confidential, and administrative folders unless explicitly requested.
- Preserve original Drive account and logical path provenance in learned records so semantic search results can point back to the source.

To run the HTTP/MCP bridge against a learned local corpus, set `ILLUSTRATOR_SEMANTIC_CORPUS` before starting the server:

```bash
ILLUSTRATOR_SEMANTIC_CORPUS=/absolute/path/to/var/drive-vector-search/learned-semantic-corpus.json npm start
```

Then browser or ChatGPT tool calls to semantic search, scientific planning, object planning, and guarded object workflows will use that corpus by default.

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
Use `inspect_vector_shape_files` on local reviewed vector files when a browser agent needs shape-combination evidence before updating a corpus.
Use `detect_illustrator_desktop` and `probe_illustrator_communication` first to prove local no-key Illustrator communication. On Windows/WSL, pass `method: "com"`, `drawCircle: true`, and `waitForResult: true` to prove Illustrator can draw a circle and report completion.
Pass `drawComplex: true` and `mouseProof: true` to prove multi-element vector drawing plus actual pointer control. Use `drive_illustrator_mouse` directly when an agent needs a measured move, click, double-click, or drag against the live Illustrator window.
Use `plan_cartoon_scene_job` for the current one-call fallback workflow: prompt -> semantic evidence -> scene plan -> static QA -> generated Illustrator JSX.
Use `plan_scientific_concept_scene_job` when the prompt is an abstract or complex scientific concept. It retrieves scientific concepts and visual metaphors before creating the Illustrator scene job.
Use `plan_object_shape_scene_job` when the prompt asks for a concrete cat, lock, or key. It returns `plan.guard`, including `guard.nextGoalPrompt` / `guard.nextPrompt` for the next refinement pass if the object is missing required recognizable parts.
Use `guard_object_shape_scene` to check a proposed scene before or after a refinement step.
Use `prepare_object_shape_workflow` or `execute_object_shape_workflow` when the browser agent should create and optionally execute a guarded object scene plus export in one tool call. Pass `maxGuardIterations: 3` when the browser should let Codex reprompt itself with guard feedback before launching Illustrator, and pass `runMode: "com"` on Windows/WSL for the no-warning Illustrator COM path.
Use `bridge_run_job_via_com` to execute any generated JSX job through Windows Illustrator COM without desktop script-warning prompts.
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
