import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { toIllustratorPath } from "./files.js";
import { normalizeJobId } from "./results.js";

export type LaunchPlatform = "auto" | "macos" | "windows" | "wsl" | "linux";

export interface LaunchJobOptions {
  platform?: LaunchPlatform;
  appPath?: string;
  dryRun?: boolean;
  root?: string;
}

export interface LaunchCommand {
  command: string;
  args: string[];
  scriptPath: string;
  platform: Exclude<LaunchPlatform, "auto">;
}

export interface LaunchJobResult {
  ok: boolean;
  launched: boolean;
  dryRun: boolean;
  command: LaunchCommand;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  next: {
    waitForResult: string;
    resultContract: string;
  };
}

export class LaunchJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LaunchJobError";
  }
}

export function buildLaunchCommand(scriptPath: string, options: LaunchJobOptions = {}): LaunchCommand {
  const hostPlatform = resolveLaunchPlatform(options.platform);
  const absoluteScriptPath = isAbsolute(scriptPath) ? scriptPath : resolve(process.cwd(), scriptPath);

  if (!existsSync(absoluteScriptPath)) {
    throw new LaunchJobError(`JSX script does not exist: ${absoluteScriptPath}`);
  }

  const hostScriptPath =
    hostPlatform === "wsl" ? toWindowsPathFromWsl(absoluteScriptPath) : hostPlatform === "windows" ? toIllustratorPath(absoluteScriptPath, "windows") : absoluteScriptPath;

  if (hostPlatform === "macos") {
    return {
      command: "open",
      args: options.appPath ? ["-a", options.appPath, hostScriptPath] : [hostScriptPath],
      scriptPath: hostScriptPath,
      platform: hostPlatform
    };
  }

  if (hostPlatform === "windows") {
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", powerShellStartProcess(hostScriptPath, options.appPath)],
      scriptPath: hostScriptPath,
      platform: hostPlatform
    };
  }

  if (hostPlatform === "wsl") {
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", powerShellStartProcess(hostScriptPath, options.appPath)],
      scriptPath: hostScriptPath,
      platform: hostPlatform
    };
  }

  return {
    command: options.appPath ?? "xdg-open",
    args: options.appPath ? [hostScriptPath] : [hostScriptPath],
    scriptPath: hostScriptPath,
    platform: hostPlatform
  };
}

export async function launchJsxJob(scriptPath: string, options: LaunchJobOptions = {}): Promise<LaunchJobResult> {
  const command = buildLaunchCommand(scriptPath, options);
  const dryRun = options.dryRun ?? false;

  if (dryRun) {
    return resultFor(command, true, false, 0, "", "", options.root);
  }

  const execution = await runLaunchCommand(command);
  return resultFor(command, false, execution.exitCode === 0, execution.exitCode, execution.stdout, execution.stderr, options.root);
}

export function jobIdFromScriptPath(scriptPath: string): string | undefined {
  const match = scriptPath.match(/([0-9a-f-]{36})\.jsx$/i);
  return match ? normalizeJobId(match[1]) : undefined;
}

export function resolveLaunchPlatform(input: LaunchPlatform | undefined): Exclude<LaunchPlatform, "auto"> {
  const selected = input ?? "auto";

  if (selected !== "auto") {
    return selected;
  }

  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    return "wsl";
  }

  const nodePlatform = platform();
  if (nodePlatform === "darwin") {
    return "macos";
  }

  if (nodePlatform === "win32") {
    return "windows";
  }

  return "linux";
}

function runLaunchCommand(command: LaunchCommand): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command.command, command.args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => reject(new LaunchJobError(error.message)));
    child.on("close", (exitCode) => {
      resolvePromise({
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      });
    });
  });
}

function resultFor(
  command: LaunchCommand,
  dryRun: boolean,
  launched: boolean,
  exitCode: number | null,
  stdout: string,
  stderr: string,
  root: string | undefined
): LaunchJobResult {
  const jobId = jobIdFromScriptPath(command.scriptPath);

  return {
    ok: dryRun || launched,
    launched,
    dryRun,
    command,
    exitCode,
    stdout,
    stderr,
    next: {
      waitForResult: waitCommand(jobId, root),
      resultContract: "Illustrator must write a JSON result file with ok=true for the launched job."
    }
  };
}

function waitCommand(jobId: string | undefined, root: string | undefined): string {
  const args = ["node", "dist/src/cli.js", "job:wait", jobId ?? "<job-id>"];
  if (root) {
    args.push("--root", root);
  }

  return args.map(quoteCliArg).join(" ");
}

function quoteCliArg(value: string): string {
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}

function escapePowerShell(value: string): string {
  return value.replace(/'/g, "''");
}

function powerShellStartProcess(scriptPath: string, appPath: string | undefined): string {
  if (appPath) {
    return `Start-Process -FilePath '${escapePowerShell(appPath)}' -ArgumentList '${escapePowerShell(scriptPath)}'`;
  }

  return `Start-Process -FilePath '${escapePowerShell(scriptPath)}'`;
}

export function toWindowsPathFromWsl(path: string): string {
  const mounted = toIllustratorPath(path, "windows");
  if (/^[A-Z]:\//i.test(mounted)) {
    return mounted;
  }

  const distro = process.env.WSL_DISTRO_NAME;
  if (!distro) {
    throw new LaunchJobError("Cannot convert WSL path for Windows host without WSL_DISTRO_NAME");
  }

  return `\\\\wsl.localhost\\${distro}${path.replace(/\//g, "\\")}`;
}
