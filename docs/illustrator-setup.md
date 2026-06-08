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
3. Select `File > Scripts > Other Script`.
4. Pick the generated `.jsx` path printed by the CLI.
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

## Agent-Facing MCP Server

Run the bridge as a stdio MCP server:

```bash
npm run mcp:serve
```

An MCP client can then call:

- `bridge_create_ping_job`
- `bridge_create_cartoon_scene_job`
- `illustrator_beta_list_tools`
- `illustrator_beta_call_tool`
