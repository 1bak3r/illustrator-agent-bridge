# Illustrator Setup

## Native MCP Path

Use this when Illustrator Beta is installed.

1. Open Illustrator Beta.
2. Open `MCP & Tools` from the application bar or preferences.
3. Copy the Codex command, or copy the `Others` URL and key.
4. Set local environment variables:

```bash
export ILLUSTRATOR_MCP_URL="http://localhost:18412/v1/mcp"
export ILLUSTRATOR_MCP_TOKEN="the_key_from_Illustrator_Beta"
npm run mcp:list-tools
```

If it works, the command prints the tools exposed by Illustrator.

## ExtendScript Fallback

Use this for regular Illustrator or when native MCP is unavailable.

If Illustrator is installed on Windows but this repo is running in WSL, put the bridge root somewhere Windows can see directly:

```bash
export ILLUSTRATOR_AGENT_BRIDGE_ROOT="/mnt/c/Users/<you>/IllustratorAgentBridge/var"
```

The bridge converts `/mnt/c/...` result paths to `C:/...` inside generated JSX.

1. Generate a job:

```bash
npm run jsx:ping
```

2. Open Illustrator.
3. Select `File > Scripts > Other Script`, then pick the generated `.jsx` path printed by the CLI.
4. Alternatively, ask the desktop to open the job:

```bash
node dist/src/cli.js job:launch <job-id> --dry-run --platform auto
node dist/src/cli.js job:launch <job-id> --platform auto
```

5. Check the matching `var/results/<job-id>.json`.

Adobe shows an external JSX warning for scripts launched outside the installed scripts folder. Leave it enabled while developing unless you have a controlled local workflow.

## Local HTTP Bridge

Start:

```bash
npm start
```

Create a ping job:

```bash
curl -sS http://127.0.0.1:4317/v1/jobs \
  -H 'content-type: application/json' \
  -d '{"kind":"ping","message":"hello Illustrator"}'
```

Create the sample cartoon scene:

```bash
curl -sS http://127.0.0.1:4317/v1/jobs \
  -H 'content-type: application/json' \
  --data-binary @<(node -e 'const fs=require("fs"); const scene=JSON.parse(fs.readFileSync("examples/cartoon-scene.json","utf8")); console.log(JSON.stringify({kind:"cartoon_scene", scene}))')
```

Create an export job after Illustrator has an active document:

```bash
npm run jsx:export -- --format pdf --output ./var/exports/figure.pdf
```

Plan from a prompt, retrieve semantic evidence, run static QA, and create the scene job:

```bash
npm run plan:cartoon -- "cartoon lab scientist with flask"
```

Prepare a complete prompt-to-export fallback runbook:

```bash
npm run workflow:cartoon -- "cartoon lab scientist with flask" --output ./var/exports/figure.pdf
```

Prepare and execute the same workflow through the launcher. Use dry-run first:

```bash
npm run workflow:execute-cartoon -- "cartoon lab scientist with flask" --output ./var/exports/figure.svg --format svg --dry-run --platform auto
```

The workflow returns two generated JSX jobs:

1. Launch or manually run the scene job in Illustrator:

```bash
node dist/src/cli.js job:launch <scene-job-id> --platform auto
```

2. Wait for its result:

```bash
node dist/src/cli.js job:wait <scene-job-id> --timeout-ms 60000
```

3. Launch or manually run the export job in Illustrator:

```bash
node dist/src/cli.js job:launch <export-job-id> --platform auto
```

4. Wait for its result:

```bash
node dist/src/cli.js job:wait <export-job-id> --timeout-ms 60000
```

5. Run export artifact QA:

```bash
node dist/src/cli.js qa:export ./var/exports/figure.png --format png --min-bytes 1000 --min-nonblank-ratio 0.001
```

## Agent-Facing MCP Server

Run the bridge as a stdio MCP server:

```bash
npm run mcp:serve
```

An MCP client can then call:

- `bridge_create_ping_job`
- `bridge_create_cartoon_scene_job`
- `bridge_create_export_job`
- `bridge_launch_job`
- `plan_cartoon_scene_job`
- `prepare_cartoon_publication_workflow`
- `execute_cartoon_publication_workflow`
- `bridge_get_job_status`
- `bridge_wait_for_job_result`
- `qa_export_artifact`
- `illustrator_beta_list_tools`
- `illustrator_beta_call_tool`
