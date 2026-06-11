import { spawn } from "node:child_process";
import type { LaunchPlatform } from "./launcher.js";

export type IllustratorMouseAction = "move" | "click" | "double-click" | "drag";
export type IllustratorMouseButton = "left" | "right";

export interface DriveIllustratorMouseOptions {
  platform: Exclude<LaunchPlatform, "auto">;
  action?: IllustratorMouseAction;
  button?: IllustratorMouseButton;
  relativeX?: number;
  relativeY?: number;
  endRelativeX?: number;
  endRelativeY?: number;
  durationMs?: number;
  windowTitlePattern?: string;
  dryRun?: boolean;
}

export interface MousePoint {
  x: number;
  y: number;
}

export interface MouseBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface DriveIllustratorMouseResult {
  ok: boolean;
  attempted: boolean;
  dryRun: boolean;
  platform: Exclude<LaunchPlatform, "auto">;
  action: IllustratorMouseAction | "unsupported" | "dry-run";
  button?: IllustratorMouseButton;
  matchedProcess?: string;
  matchedWindow?: string;
  bounds?: MouseBounds;
  start?: MousePoint;
  end?: MousePoint;
  initialCursor?: MousePoint;
  finalCursor?: MousePoint;
  foregroundConfirmed?: boolean;
  targetPointConfirmed?: boolean;
  endPointConfirmed?: boolean;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export async function driveIllustratorMouse(options: DriveIllustratorMouseOptions): Promise<DriveIllustratorMouseResult> {
  if (options.platform !== "windows" && options.platform !== "wsl") {
    return {
      ok: false,
      attempted: false,
      dryRun: Boolean(options.dryRun),
      platform: options.platform,
      action: "unsupported",
      error: "Mouse automation is currently implemented for Windows and WSL-hosted Illustrator only."
    };
  }

  const action = options.action ?? "move";
  const button = options.button ?? "left";
  const relativeX = unitNumber(options.relativeX ?? 0.5, "relativeX");
  const relativeY = unitNumber(options.relativeY ?? 0.5, "relativeY");
  const endRelativeX = unitNumber(options.endRelativeX ?? Math.min(0.9, relativeX + 0.2), "endRelativeX");
  const endRelativeY = unitNumber(options.endRelativeY ?? relativeY, "endRelativeY");
  const durationMs = Math.max(0, Math.trunc(options.durationMs ?? 250));
  const script = mousePowerShell({
    action,
    button,
    relativeX,
    relativeY,
    endRelativeX,
    endRelativeY,
    durationMs,
    windowTitlePattern: options.windowTitlePattern
  });

  if (options.dryRun) {
    return {
      ok: true,
      attempted: false,
      dryRun: true,
      platform: options.platform,
      action: "dry-run",
      button,
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
    action: normalizeAction(parsed?.action) ?? action,
    button: normalizeButton(parsed?.button) ?? button,
    matchedProcess: stringOrUndefined(parsed?.matchedProcess),
    matchedWindow: stringOrUndefined(parsed?.matchedWindow),
    bounds: mouseBoundsOrUndefined(parsed?.bounds),
    start: mousePointOrUndefined(parsed?.start),
    end: mousePointOrUndefined(parsed?.end),
    initialCursor: mousePointOrUndefined(parsed?.initialCursor),
    finalCursor: mousePointOrUndefined(parsed?.finalCursor),
    foregroundConfirmed: booleanOrUndefined(parsed?.foregroundConfirmed),
    targetPointConfirmed: booleanOrUndefined(parsed?.targetPointConfirmed),
    endPointConfirmed: booleanOrUndefined(parsed?.endPointConfirmed),
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
  const lines = stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

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

function unitNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a number between 0 and 1`);
  }

  return value;
}

function normalizeAction(input: unknown): IllustratorMouseAction | undefined {
  if (input === "move" || input === "click" || input === "double-click" || input === "drag") {
    return input;
  }

  return undefined;
}

function normalizeButton(input: unknown): IllustratorMouseButton | undefined {
  if (input === "left" || input === "right") {
    return input;
  }

  return undefined;
}

function stringOrUndefined(input: unknown): string | undefined {
  return typeof input === "string" && input.length > 0 ? input : undefined;
}

function booleanOrUndefined(input: unknown): boolean | undefined {
  return typeof input === "boolean" ? input : undefined;
}

function mousePointOrUndefined(input: unknown): MousePoint | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }

  const value = input as Record<string, unknown>;
  if (typeof value.x !== "number" || typeof value.y !== "number") {
    return undefined;
  }

  return { x: value.x, y: value.y };
}

function mouseBoundsOrUndefined(input: unknown): MouseBounds | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }

  const value = input as Record<string, unknown>;
  const keys = ["left", "top", "right", "bottom", "width", "height"] as const;
  if (keys.some((key) => typeof value[key] !== "number")) {
    return undefined;
  }

  return {
    left: value.left as number,
    top: value.top as number,
    right: value.right as number,
    bottom: value.bottom as number,
    width: value.width as number,
    height: value.height as number
  };
}

function mousePowerShell(options: {
  action: IllustratorMouseAction;
  button: IllustratorMouseButton;
  relativeX: number;
  relativeY: number;
  endRelativeX: number;
  endRelativeY: number;
  durationMs: number;
  windowTitlePattern?: string;
}): string {
  return `
$ErrorActionPreference = "Stop"
$action = ${powerShellString(options.action)}
$button = ${powerShellString(options.button)}
$relativeX = ${options.relativeX}
$relativeY = ${options.relativeY}
$endRelativeX = ${options.endRelativeX}
$endRelativeY = ${options.endRelativeY}
$durationMs = ${options.durationMs}
$windowTitlePattern = ${powerShellString(options.windowTitlePattern ?? "")}
$result = [ordered]@{
  ok = $false
  attempted = $true
  action = $action
  button = $button
  matchedProcess = $null
  matchedWindow = $null
  bounds = $null
  start = $null
  end = $null
  initialCursor = $null
  finalCursor = $null
  foregroundConfirmed = $false
  targetPointConfirmed = $false
  endPointConfirmed = $false
  error = $null
}

function Finish($code) {
  $result | ConvertTo-Json -Depth 8 -Compress
  exit $code
}

try {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class AgentBridgeMouse {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")]
  public static extern bool GetCursorPos(out POINT lpPoint);
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern IntPtr SetActiveWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("kernel32.dll")]
  public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")]
  public static extern IntPtr WindowFromPoint(POINT Point);
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@

  $processes = Get-Process | Where-Object {
    $_.ProcessName -match "(?i)Illustrator" -and $_.MainWindowHandle -ne 0
  } | Sort-Object Id -Descending

  $target = $null
  foreach ($process in $processes) {
    $title = [string]$process.MainWindowTitle
    if ($windowTitlePattern.Length -eq 0 -or $title -match $windowTitlePattern) {
      $target = $process
      break
    }
  }

  if ($null -eq $target) {
    $result.error = "No running Illustrator window with a main window handle was found."
    Finish 1
  }

  $handle = $target.MainWindowHandle
  $rect = New-Object AgentBridgeMouse+RECT
  if (-not [AgentBridgeMouse]::GetWindowRect($handle, [ref]$rect)) {
    $result.error = "Unable to read Illustrator window bounds."
    Finish 1
  }

  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) {
    $result.error = "Illustrator window bounds are empty."
    Finish 1
  }

  $startX = $rect.Left + [int][Math]::Round($width * $relativeX)
  $startY = $rect.Top + [int][Math]::Round($height * $relativeY)
  $endX = $rect.Left + [int][Math]::Round($width * $endRelativeX)
  $endY = $rect.Top + [int][Math]::Round($height * $endRelativeY)

  $result.matchedProcess = $target.ProcessName
  $result.matchedWindow = [string]$target.MainWindowTitle
  $result.bounds = [ordered]@{
    left = $rect.Left
    top = $rect.Top
    right = $rect.Right
    bottom = $rect.Bottom
    width = $width
    height = $height
  }
  $result.start = [ordered]@{ x = $startX; y = $startY }
  $result.end = [ordered]@{ x = $endX; y = $endY }

  [void][AgentBridgeMouse]::ShowWindowAsync($handle, 9)
  Start-Sleep -Milliseconds 150
  $shell = New-Object -ComObject WScript.Shell
  [void]$shell.AppActivate([int]$target.Id)
  Start-Sleep -Milliseconds 250
  [uint32]$unusedProcessId = 0
  $foregroundBefore = [AgentBridgeMouse]::GetForegroundWindow()
  $foregroundThreadId = [AgentBridgeMouse]::GetWindowThreadProcessId($foregroundBefore, [ref]$unusedProcessId)
  $targetThreadId = [AgentBridgeMouse]::GetWindowThreadProcessId($handle, [ref]$unusedProcessId)
  $currentThreadId = [AgentBridgeMouse]::GetCurrentThreadId()
  if ($foregroundThreadId -ne 0) {
    [void][AgentBridgeMouse]::AttachThreadInput($currentThreadId, $foregroundThreadId, $true)
  }
  if ($targetThreadId -ne 0) {
    [void][AgentBridgeMouse]::AttachThreadInput($currentThreadId, $targetThreadId, $true)
  }
  try {
    [void][AgentBridgeMouse]::ShowWindowAsync($handle, 9)
    [void][AgentBridgeMouse]::BringWindowToTop($handle)
    [void][AgentBridgeMouse]::SetActiveWindow($handle)
    [void][AgentBridgeMouse]::SetForegroundWindow($handle)
    $shell.SendKeys("%")
    Start-Sleep -Milliseconds 100
    [void][AgentBridgeMouse]::SetForegroundWindow($handle)
  } finally {
    if ($targetThreadId -ne 0) {
      [void][AgentBridgeMouse]::AttachThreadInput($currentThreadId, $targetThreadId, $false)
    }
    if ($foregroundThreadId -ne 0) {
      [void][AgentBridgeMouse]::AttachThreadInput($currentThreadId, $foregroundThreadId, $false)
    }
  }
  Start-Sleep -Milliseconds 250
  $foreground = [AgentBridgeMouse]::GetForegroundWindow()
  [uint32]$foregroundProcessId = 0
  [void][AgentBridgeMouse]::GetWindowThreadProcessId($foreground, [ref]$foregroundProcessId)
  $result.foregroundConfirmed = ($foregroundProcessId -eq [uint32]$target.Id)

  $startPoint = New-Object AgentBridgeMouse+POINT
  $startPoint.X = $startX
  $startPoint.Y = $startY
  $pointWindow = [AgentBridgeMouse]::WindowFromPoint($startPoint)
  [uint32]$pointProcessId = 0
  [void][AgentBridgeMouse]::GetWindowThreadProcessId($pointWindow, [ref]$pointProcessId)
  $result.targetPointConfirmed = ($pointProcessId -eq [uint32]$target.Id)

  $endPoint = New-Object AgentBridgeMouse+POINT
  $endPoint.X = $endX
  $endPoint.Y = $endY
  $endWindow = [AgentBridgeMouse]::WindowFromPoint($endPoint)
  [uint32]$endProcessId = 0
  [void][AgentBridgeMouse]::GetWindowThreadProcessId($endWindow, [ref]$endProcessId)
  $result.endPointConfirmed = ($endProcessId -eq [uint32]$target.Id)

  $pointsAreSafe = if ($action -eq "drag") { $result.targetPointConfirmed -and $result.endPointConfirmed } else { $result.targetPointConfirmed }
  if (-not ($result.foregroundConfirmed -or $pointsAreSafe)) {
    $result.error = "Illustrator window could not be focused and the target mouse point is not confirmed to belong to Illustrator."
    Finish 1
  }

  $before = New-Object AgentBridgeMouse+POINT
  [void][AgentBridgeMouse]::GetCursorPos([ref]$before)
  $result.initialCursor = [ordered]@{ x = $before.X; y = $before.Y }

  $leftDown = 0x0002
  $leftUp = 0x0004
  $rightDown = 0x0008
  $rightUp = 0x0010
  $down = if ($button -eq "right") { $rightDown } else { $leftDown }
  $up = if ($button -eq "right") { $rightUp } else { $leftUp }

  [void][AgentBridgeMouse]::SetCursorPos($startX, $startY)
  Start-Sleep -Milliseconds 100

  if ($action -eq "click" -or $action -eq "double-click") {
    [AgentBridgeMouse]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 60
    [AgentBridgeMouse]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
    if ($action -eq "double-click") {
      Start-Sleep -Milliseconds 100
      [AgentBridgeMouse]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
      Start-Sleep -Milliseconds 60
      [AgentBridgeMouse]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
    }
  } elseif ($action -eq "drag") {
    [AgentBridgeMouse]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
    $steps = 12
    $sleep = [Math]::Max(10, [int][Math]::Round($durationMs / $steps))
    for ($i = 1; $i -le $steps; $i += 1) {
      $x = [int][Math]::Round($startX + (($endX - $startX) * ($i / $steps)))
      $y = [int][Math]::Round($startY + (($endY - $startY) * ($i / $steps)))
      [void][AgentBridgeMouse]::SetCursorPos($x, $y)
      Start-Sleep -Milliseconds $sleep
    }
    [AgentBridgeMouse]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
  }

  $after = New-Object AgentBridgeMouse+POINT
  [void][AgentBridgeMouse]::GetCursorPos([ref]$after)
  $result.finalCursor = [ordered]@{ x = $after.X; y = $after.Y }
  $result.ok = $true
} catch {
  $result.error = $_.Exception.Message
}

if ($result.ok) {
  Finish 0
} else {
  Finish 1
}
`.trim();
}

function powerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
