# Illustrator Communication Proof

This document records the first working local automation proof: Codex can reach Adobe Illustrator without an OpenAI API key and make Illustrator draw a vector circle.

## Environment Proven

- Host shell: WSL
- Illustrator host: Windows desktop
- Illustrator detected: `Adobe Illustrator 2026`
- Illustrator executable: `C:/Program Files/Adobe/Adobe Illustrator 2026/Support Files/Contents/Windows/Illustrator.exe`
- Illustrator app/version reported by script result: `Adobe Illustrator` `30.5.1`

## Reproduction Commands

Build the bridge:

```bash
npm install
npm run build
```

Detect Illustrator:

```bash
node dist/src/cli.js illustrator:detect --platform auto
```

Run the no-key circle probe:

```bash
node dist/src/cli.js illustrator:probe \
  --platform auto \
  --method com \
  --draw-circle \
  --wait \
  --timeout-ms 30000 \
  --interval-ms 1000
```

The COM route runs the generated JSX with:

```text
Illustrator.Application.DoJavaScriptFile(<generated-job.jsx>)
```

That avoids the Adobe external-script prompt that can appear when launching JSX files through the desktop shell.

## Expected Successful Probe Shape

A successful probe returns:

```json
{
  "ok": true,
  "communicationConfirmed": true,
  "platform": "wsl",
  "method": "com",
  "result": {
    "exists": true,
    "result": {
      "ok": true,
      "kind": "cartoon_scene",
      "elementCount": 1,
      "app": "Adobe Illustrator",
      "version": "30.5.1"
    }
  }
}
```

The generated JSX creates a `360 x 240` RGB document and one ellipse named `communication proof circle` with width and height `140`.

## Direct Illustrator Object Check

After the probe, this PowerShell check reads the active Illustrator document through COM:

```powershell
$app = New-Object -ComObject Illustrator.Application
$doc = $app.ActiveDocument
$item = $doc.PathItems.Item(1)
[pscustomobject]@{
  Document = $doc.Name
  PathItems = $doc.PathItems.Count
  FirstPathName = $item.Name
  Width = [math]::Round($item.Width, 2)
  Height = [math]::Round($item.Height, 2)
} | ConvertTo-Json -Compress
```

Observed result:

```json
{"Document":"Untitled-3","PathItems":1,"FirstPathName":"communication proof circle","Width":140,"Height":140}
```

## Why This Matters

This proves the minimum viable control loop:

```text
agent/CLI/browser -> local bridge -> generated JSX -> Illustrator COM -> Illustrator document -> JSON result
```

More complex cartoon scenes use the same path. The higher-level planner already emits validated scene JSON, the semantic search layer can retrieve visual/object knowledge before planning, and export QA can inspect generated artifacts after Illustrator exports them.

## Current Agent Surfaces

- CLI: `illustrator:detect`, `illustrator:probe`
- HTTP: `GET /v1/illustrator/detect`, `POST /v1/illustrator/probe`
- Dashboard: `http://127.0.0.1:4317/dashboard`
- MCP: `detect_illustrator_desktop`, `probe_illustrator_communication`

## Next Work

- Use COM as the default Windows/WSL execution route for full prompt-to-export workflows.
- Add a browser-agent runbook that opens the dashboard, runs the probe, executes a cartoon workflow, and checks export QA.
- Expand semantic evidence for publication-quality scientific cartoon objects and styles.
- Add iterative visual review after PNG export so the agent can revise the Illustrator scene before declaring work complete.
