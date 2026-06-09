import { spawn } from "node:child_process";
import type { LaunchPlatform } from "./launcher.js";

export interface ConfirmIllustratorDialogOptions {
  platform: Exclude<LaunchPlatform, "auto">;
  timeoutMs?: number;
  intervalMs?: number;
  dryRun?: boolean;
}

export interface ConfirmIllustratorDialogResult {
  ok: boolean;
  attempted: boolean;
  dryRun: boolean;
  platform: Exclude<LaunchPlatform, "auto">;
  action: "invoke-button" | "send-enter" | "none" | "unsupported" | "dry-run";
  matchedWindow?: string;
  matchedButton?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export async function confirmIllustratorDialog(options: ConfirmIllustratorDialogOptions): Promise<ConfirmIllustratorDialogResult> {
  if (options.platform !== "windows" && options.platform !== "wsl") {
    return {
      ok: false,
      attempted: false,
      dryRun: Boolean(options.dryRun),
      platform: options.platform,
      action: "unsupported",
      error: "Dialog automation is currently implemented for Windows and WSL-hosted Illustrator only."
    };
  }

  const script = confirmDialogPowerShell(options.timeoutMs ?? 15_000, options.intervalMs ?? 250);
  if (options.dryRun) {
    return {
      ok: true,
      attempted: false,
      dryRun: true,
      platform: options.platform,
      action: "dry-run",
      stdout: script
    };
  }

  const execution = await runPowerShell(script);
  const parsed = parsePowerShellResult(execution.stdout);
  return {
    ok: execution.exitCode === 0 && Boolean(parsed?.ok),
    attempted: Boolean(parsed?.attempted),
    dryRun: false,
    platform: options.platform,
    action: normalizeAction(parsed?.action),
    matchedWindow: stringOrUndefined(parsed?.matchedWindow),
    matchedButton: stringOrUndefined(parsed?.matchedButton),
    exitCode: execution.exitCode,
    stdout: execution.stdout,
    stderr: execution.stderr,
    error: stringOrUndefined(parsed?.error) ?? (execution.exitCode === 0 ? undefined : execution.stderr)
  };
}

function runPowerShell(script: string): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const encoded = Buffer.from(script, "utf16le").toString("base64");

  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => reject(error));
    child.on("close", (exitCode) => {
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      });
    });
  });
}

function parsePowerShellResult(stdout: string): Record<string, unknown> | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return undefined;
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // PowerShell may emit warnings before the final JSON line.
    }
  }

  return undefined;
}

function normalizeAction(input: unknown): ConfirmIllustratorDialogResult["action"] {
  if (input === "invoke-button" || input === "send-enter" || input === "none" || input === "unsupported" || input === "dry-run") {
    return input;
  }

  return "none";
}

function stringOrUndefined(input: unknown): string | undefined {
  return typeof input === "string" && input.length > 0 ? input : undefined;
}

function confirmDialogPowerShell(timeoutMs: number, intervalMs: number): string {
  return `
$ErrorActionPreference = "Stop"
$deadline = (Get-Date).AddMilliseconds(${Math.max(0, Math.trunc(timeoutMs))})
$intervalMs = ${Math.max(50, Math.trunc(intervalMs))}
$result = [ordered]@{
  ok = $false
  attempted = $true
  action = "none"
  matchedWindow = $null
  matchedButton = $null
  error = $null
}

try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type -AssemblyName System.Windows.Forms

  $buttonNames = @("Continue", "OK", "Yes", "Run", "Allow", "Open")
  while ((Get-Date) -lt $deadline) {
    $root = [Windows.Automation.AutomationElement]::RootElement
    $windowCondition = New-Object Windows.Automation.PropertyCondition(
      [Windows.Automation.AutomationElement]::ControlTypeProperty,
      [Windows.Automation.ControlType]::Window
    )
    $windows = $root.FindAll([Windows.Automation.TreeScope]::Children, $windowCondition)

    foreach ($window in $windows) {
      $windowName = $window.Current.Name
      $processId = $window.Current.ProcessId
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
      $processName = if ($process) { $process.ProcessName } else { "" }
      $windowLooksRelevant = $windowName -match "(?i)(Adobe Illustrator|Illustrator|script|javascript|extendscript)"
      $processLooksRelevant = $processName -match "(?i)^Illustrator"
      if (-not ($windowLooksRelevant -or $processLooksRelevant)) {
        continue
      }

      $buttonCondition = New-Object Windows.Automation.PropertyCondition(
        [Windows.Automation.AutomationElement]::ControlTypeProperty,
        [Windows.Automation.ControlType]::Button
      )
      $buttons = $window.FindAll([Windows.Automation.TreeScope]::Descendants, $buttonCondition)
      foreach ($button in $buttons) {
        $buttonName = $button.Current.Name
        foreach ($candidate in $buttonNames) {
          if ($buttonName -match ("(?i)^" + [regex]::Escape($candidate) + "$")) {
            $invokePattern = $button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern)
            $invokePattern.Invoke()
            $result.ok = $true
            $result.action = "invoke-button"
            $result.matchedWindow = $windowName
            $result.matchedButton = $buttonName
            $result | ConvertTo-Json -Compress
            exit 0
          }
        }
      }

      if ($processLooksRelevant -and $windowName -match "(?i)(Adobe Illustrator|script|javascript|extendscript)") {
        $shell = New-Object -ComObject WScript.Shell
        [void]$shell.AppActivate($processId)
        Start-Sleep -Milliseconds 150
        [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
        $result.ok = $true
        $result.action = "send-enter"
        $result.matchedWindow = $windowName
        $result | ConvertTo-Json -Compress
        exit 0
      }
    }

    Start-Sleep -Milliseconds $intervalMs
  }
} catch {
  $result.error = $_.Exception.Message
}

$result | ConvertTo-Json -Compress
if ($result.ok) { exit 0 } else { exit 1 }
`.trim();
}
