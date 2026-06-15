import { spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { toAdobeHostPath } from "./files.js";
import { jobIdFromScriptPath, toWindowsPathFromWsl, type LaunchCommand, type LaunchJobResult, type LaunchPlatform } from "./launcher.js";

export interface RunPhotoshopComOptions {
  platform: Exclude<LaunchPlatform, "auto">;
  dryRun?: boolean;
  root?: string;
}

export async function runJsxViaPhotoshopCom(scriptPath: string, options: RunPhotoshopComOptions): Promise<LaunchJobResult> {
  if (options.platform !== "windows" && options.platform !== "wsl") {
    throw new Error("Photoshop COM automation is available only for Windows and WSL-hosted Photoshop.");
  }

  const command = buildPhotoshopComCommand(scriptPath, options.platform);
  if (options.dryRun) {
    return resultFor(command, true, false, 0, "", "", options.root);
  }

  const execution = await runPowerShell(command);
  return resultFor(command, false, execution.exitCode === 0, execution.exitCode, execution.stdout, execution.stderr, options.root);
}

function buildPhotoshopComCommand(scriptPath: string, platform: "windows" | "wsl"): LaunchCommand {
  const absoluteScriptPath = isAbsolute(scriptPath) ? scriptPath : resolve(process.cwd(), scriptPath);
  const hostScriptPath = platform === "wsl" ? toWindowsPathFromWsl(absoluteScriptPath) : toAdobeHostPath(absoluteScriptPath, "windows");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$app = New-Object -ComObject Photoshop.Application",
    `$app.DoJavaScriptFile('${escapePowerShell(hostScriptPath)}') | Out-Null`
  ].join("\n");

  return {
    command: "powershell.exe",
    args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
    scriptPath: hostScriptPath,
    platform
  };
}

function runPowerShell(command: LaunchCommand): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command.command, command.args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => reject(error));
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
      resultContract: "Photoshop must write a JSON result file with ok=true for the executed proof job."
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
