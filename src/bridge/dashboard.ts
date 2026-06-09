export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Illustrator Agent Bridge</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f7f8;
      --panel: #ffffff;
      --ink: #182126;
      --muted: #5e6c74;
      --line: #cbd5da;
      --accent: #146c7c;
      --accent-strong: #0d4f5c;
      --ok: #166534;
      --warn: #9a5c00;
      --bad: #a62525;
      --soft: #e8f3f5;
      --shadow: 0 8px 28px rgba(24, 33, 38, 0.08);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 28px;
      border-bottom: 1px solid var(--line);
      background: #ffffff;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0;
    }

    main {
      display: grid;
      grid-template-columns: minmax(360px, 520px) minmax(0, 1fr);
      gap: 18px;
      padding: 18px;
    }

    section {
      min-width: 0;
    }

    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }

    .panel h2 {
      margin: 0;
      padding: 16px 16px 0;
      font-size: 15px;
      letter-spacing: 0;
    }

    form,
    .panel-body {
      padding: 16px;
    }

    label {
      display: grid;
      gap: 6px;
      font-size: 12px;
      font-weight: 650;
      color: var(--muted);
    }

    input,
    select,
    textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 9px 10px;
      color: var(--ink);
      background: #ffffff;
      font: inherit;
      font-size: 14px;
    }

    textarea {
      min-height: 86px;
      resize: vertical;
    }

    .grid {
      display: grid;
      gap: 12px;
    }

    .two {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .three {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .toggles {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      padding: 6px 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      color: var(--ink);
      background: #ffffff;
      font-size: 13px;
      font-weight: 600;
    }

    .toggle input {
      width: 16px;
      height: 16px;
      margin: 0;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 14px;
    }

    button {
      border: 1px solid transparent;
      border-radius: 6px;
      min-height: 36px;
      padding: 8px 12px;
      color: #ffffff;
      background: var(--accent);
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }

    button.secondary {
      color: var(--accent-strong);
      background: var(--soft);
      border-color: #a8cfd6;
    }

    button.ghost {
      color: var(--ink);
      background: #ffffff;
      border-color: var(--line);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 30px;
      padding: 5px 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      background: #ffffff;
      font-size: 13px;
      font-weight: 650;
      white-space: nowrap;
    }

    .status.ok {
      color: var(--ok);
      border-color: #aac8b5;
      background: #edf8f0;
    }

    .status.bad {
      color: var(--bad);
      border-color: #e3b3b3;
      background: #fff0f0;
    }

    .results {
      display: grid;
      gap: 14px;
    }

    .jobs {
      display: grid;
      gap: 8px;
    }

    .job-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fbfdfe;
    }

    .job-title {
      margin: 0 0 2px;
      font-size: 13px;
      font-weight: 750;
    }

    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      color: var(--muted);
      overflow-wrap: anywhere;
    }

    pre {
      max-height: 560px;
      overflow: auto;
      margin: 0;
      padding: 14px;
      border-radius: 6px;
      background: #10181c;
      color: #e7f2f4;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
    }

    .qa-list {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .qa-list li {
      display: flex;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 6px;
      background: #f7fafb;
      border: 1px solid var(--line);
      font-size: 13px;
    }

    .qa-list .pass {
      color: var(--ok);
    }

    .qa-list .warn {
      color: var(--warn);
    }

    .qa-list .fail {
      color: var(--bad);
    }

    @media (max-width: 860px) {
      header {
        align-items: flex-start;
        flex-direction: column;
        padding: 16px;
      }

      main {
        grid-template-columns: 1fr;
        padding: 12px;
      }

      .two,
      .three {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>Illustrator Agent Bridge</h1>
    <span id="health" class="status">checking</span>
  </header>
  <main>
    <section class="panel">
      <h2>Workflow</h2>
      <form id="workflowForm" class="grid">
        <label>
          Prompt
          <textarea name="prompt">cartoon lab scientist with flask</textarea>
        </label>
        <label>
          Output
          <input name="outputPath" value="var/exports/figure.png">
        </label>
        <div class="grid three">
          <label>
            Format
            <select name="format">
              <option value="png">png</option>
              <option value="svg">svg</option>
              <option value="pdf">pdf</option>
              <option value="jpg">jpg</option>
            </select>
          </label>
          <label>
            Platform
            <select name="platform">
              <option value="auto">auto</option>
              <option value="macos">macos</option>
              <option value="windows">windows</option>
              <option value="wsl">wsl</option>
              <option value="linux">linux</option>
            </select>
          </label>
          <label>
            Nonblank
            <input name="minNonBlankRatio" value="0.001" inputmode="decimal">
          </label>
        </div>
        <div class="grid two">
          <label>
            Width
            <input name="width" value="720" inputmode="numeric">
          </label>
          <label>
            Height
            <input name="height" value="480" inputmode="numeric">
          </label>
        </div>
        <label>
          App
          <input name="appPath" placeholder="Adobe Illustrator">
        </label>
        <div class="toggles">
          <label class="toggle"><input type="checkbox" name="dryRun" checked> Dry run</label>
          <label class="toggle"><input type="checkbox" name="waitForResults"> Wait</label>
          <label class="toggle"><input type="checkbox" name="skipQa"> Skip QA</label>
        </div>
        <div class="actions">
          <button type="button" id="execute">Execute</button>
          <button type="button" id="prepare" class="secondary">Prepare</button>
          <button type="button" id="ping" class="ghost">Ping Job</button>
        </div>
      </form>
    </section>
    <section class="results">
      <div class="panel">
        <h2>Jobs</h2>
        <div class="panel-body">
          <div id="jobs" class="jobs"></div>
        </div>
      </div>
      <div class="panel">
        <h2>QA</h2>
        <div class="panel-body">
          <ul id="qa" class="qa-list"></ul>
        </div>
      </div>
      <div class="panel">
        <h2>Result</h2>
        <div class="panel-body">
          <pre id="result">{}</pre>
        </div>
      </div>
    </section>
  </main>
  <script>
    const state = { jobs: [] };
    const form = document.querySelector("#workflowForm");
    const result = document.querySelector("#result");
    const jobs = document.querySelector("#jobs");
    const qa = document.querySelector("#qa");
    const health = document.querySelector("#health");

    function numberValue(data, key) {
      const value = data.get(key);
      if (value === null || String(value).trim() === "") return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    function payload() {
      const data = new FormData(form);
      const body = {
        prompt: String(data.get("prompt") || ""),
        outputPath: String(data.get("outputPath") || ""),
        format: String(data.get("format") || "png"),
        platform: String(data.get("platform") || "auto"),
        width: numberValue(data, "width"),
        height: numberValue(data, "height"),
        minNonBlankRatio: numberValue(data, "minNonBlankRatio"),
        dryRun: data.has("dryRun"),
        waitForResults: data.has("waitForResults"),
        skipQa: data.has("skipQa")
      };
      const appPath = String(data.get("appPath") || "").trim();
      if (appPath) body.appPath = appPath;
      Object.keys(body).forEach((key) => body[key] === undefined && delete body[key]);
      return body;
    }

    async function api(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: {
          "content-type": "application/json",
          ...(options.headers || {})
        }
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || response.statusText);
      return body;
    }

    function show(value) {
      result.textContent = JSON.stringify(value, null, 2);
      renderQa(value.exportQa || value.report);
      renderJobs(value);
    }

    function addJob(label, job) {
      if (!job || !job.id) return;
      if (state.jobs.some((item) => item.id === job.id)) return;
      state.jobs.unshift({ label, id: job.id, path: job.jobPath || job.resultPath || "" });
    }

    function renderJobs(value) {
      if (value.job) addJob(value.job.kind || "job", value.job);
      if (value.sceneJob) addJob("scene", value.sceneJob);
      if (value.exportJob) addJob("export", value.exportJob);
      if (value.workflow) {
        addJob("scene", value.workflow.sceneJob);
        addJob("export", value.workflow.exportJob);
      }
      jobs.innerHTML = "";
      for (const job of state.jobs.slice(0, 12)) {
        const row = document.createElement("div");
        row.className = "job-row";
        row.innerHTML = '<div><p class="job-title"></p><div class="mono"></div></div><button class="secondary" type="button">Status</button>';
        row.querySelector(".job-title").textContent = job.label;
        row.querySelector(".mono").textContent = job.id;
        row.querySelector("button").addEventListener("click", () => checkJob(job.id));
        jobs.appendChild(row);
      }
    }

    function renderQa(report) {
      qa.innerHTML = "";
      const checks = report && report.checks ? report.checks : [];
      for (const check of checks) {
        const item = document.createElement("li");
        item.innerHTML = '<strong></strong><span></span>';
        item.querySelector("strong").className = check.status;
        item.querySelector("strong").textContent = check.status;
        item.querySelector("span").textContent = check.message;
        qa.appendChild(item);
      }
    }

    async function checkJob(id) {
      try {
        show(await api('/v1/jobs/' + encodeURIComponent(id) + '/status'));
      } catch (error) {
        show({ ok: false, error: String(error.message || error) });
      }
    }

    document.querySelector("#execute").addEventListener("click", async () => {
      try {
        show(await api("/v1/workflows/cartoon/execute", { method: "POST", body: JSON.stringify(payload()) }));
      } catch (error) {
        show({ ok: false, error: String(error.message || error) });
      }
    });

    document.querySelector("#prepare").addEventListener("click", async () => {
      try {
        const body = payload();
        show(await api("/v1/workflows/cartoon", {
          method: "POST",
          body: JSON.stringify({
            prompt: body.prompt,
            outputPath: body.outputPath,
            format: body.format,
            width: body.width,
            height: body.height
          })
        }));
      } catch (error) {
        show({ ok: false, error: String(error.message || error) });
      }
    });

    document.querySelector("#ping").addEventListener("click", async () => {
      try {
        show(await api("/v1/jobs", { method: "POST", body: JSON.stringify({ kind: "ping", message: "dashboard ping" }) }));
      } catch (error) {
        show({ ok: false, error: String(error.message || error) });
      }
    });

    fetch("/health")
      .then((response) => response.json())
      .then((body) => {
        health.textContent = body.ok ? "ready" : "error";
        health.className = body.ok ? "status ok" : "status bad";
      })
      .catch(() => {
        health.textContent = "offline";
        health.className = "status bad";
      });
  </script>
</body>
</html>`;
}
