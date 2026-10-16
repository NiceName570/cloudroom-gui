import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import semverCompare from "semver/functions/compare.js";
import semverValid from "semver/functions/valid.js";
import { z } from "zod";
import { spawnPortableProcess } from "@cloudroom/process-utils";
import type {
  ProviderInstallationCommand,
  ProviderInstallationSource,
  ProviderInstallationStatus,
  ProviderInstallationVerification,
} from "../provider-maintenance.js";

export { findCliExecutable } from "@cloudroom/process-utils";

const execFileAsync = promisify(execFile);

const CLI_PROBE_TIMEOUT_MS = 5_000;
const INSTALLATION_CHECK_TIMEOUT_MS = 15_000;

export async function resolveExecutablePath(
  command: string,
): Promise<string | null> {
  if (path.isAbsolute(command)) {
    try {
      await access(command, fsConstants.X_OK);
      return command;
    } catch {
      return null;
    }
  }
  try {
    const lookup = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFileAsync(lookup, [command], {
      timeout: CLI_PROBE_TIMEOUT_MS,
    });
    return (
      stdout
        .split(/\r?\n/u)
        .find((line) => line.trim())
        ?.trim() ?? null
    );
  } catch {
    return null;
  }
}

export async function commandOutput(
  command: string,
  args: readonly string[],
): Promise<string | null> {
  return captureCommand(command, args, INSTALLATION_CHECK_TIMEOUT_MS);
}

function captureCommand(
  command: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawnPortableProcess({
      command,
      args: [...args],
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, timeoutMs);
    const output = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) {
        child.kill();
        finish(null);
        return;
      }
      chunks.push(chunk);
    };
    child.stdout?.on("data", output);
    child.stderr?.on("data", output);
    child.stdin?.end();
    child.once("error", () => finish(null));
    child.once("close", (code) =>
      finish(code === 0 ? Buffer.concat(chunks).toString("utf8").trim() : null),
    );
  });
}

export function versionFrom(value: string | null): string | null {
  const candidate = value?.match(/\bv?(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)/u)?.[1];
  return candidate !== undefined && semverValid(candidate) !== null
    ? candidate
    : null;
}

export async function readCliVersion(command: string): Promise<string | null> {
  return versionFrom(
    await captureCommand(command, ["--version"], CLI_PROBE_TIMEOUT_MS),
  );
}

export function compareVersions(left: string, right: string): number {
  return semverCompare(left, right);
}

export function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function formatCommand(
  command: string,
  args: readonly string[],
): string {
  return [command, ...args]
    .map((part) =>
      /^[A-Za-z0-9_./:@+-]+$/u.test(part)
        ? part
        : `'${part.replace(/'/gu, "'\\''")}'`,
    )
    .join(" ");
}

export function npmGlobalInstallCommand(
  npmPackage: string,
): ProviderInstallationCommand {
  const command = npmCommand();
  const args = ["install", "-g", `${npmPackage}@latest`];
  return { command, args, displayCommand: formatCommand(command, args) };
}

export async function npmLatestVersion(
  npmPackage: string,
): Promise<string | null> {
  return versionFrom(
    await commandOutput(npmCommand(), ["view", npmPackage, "version"]),
  );
}

export interface NpmGlobalPackageProbe {
  npmBin: string | null;
  npmGlobalPackageVersion: string | null;
}

export async function probeNpmGlobalPackage(
  npmPackage: string,
): Promise<NpmGlobalPackageProbe> {
  const npm = npmCommand();
  const [prefixOutput, listOutput] = await Promise.all([
    commandOutput(npm, ["prefix", "-g"]),
    commandOutput(npm, ["list", "-g", npmPackage, "--depth=0", "--json"]),
  ]);
  const npmPrefix = firstLine(prefixOutput);
  return {
    npmBin:
      npmPrefix === null
        ? null
        : process.platform === "win32"
          ? npmPrefix
          : path.join(npmPrefix, "bin"),
    npmGlobalPackageVersion: npmGlobalPackageVersion(listOutput, npmPackage),
  };
}

function firstLine(value: string | null): string | null {
  return (
    value
      ?.split(/\r?\n/u)
      .map((line) => line.trim())
      .find(Boolean) ?? null
  );
}

function npmGlobalPackageVersion(
  value: string | null,
  npmPackage: string,
): string | null {
  if (value === null) return null;
  try {
    const parsed = z
      .object({
        dependencies: z
          .record(z.string(), z.object({ version: z.string().min(1) }))
          .default({}),
      })
      .safeParse(JSON.parse(value));
    return parsed.success
      ? (parsed.data.dependencies[npmPackage]?.version ?? null)
      : null;
  } catch {
    return null;
  }
}

function pathIsInside(child: string, parent: string): boolean {
  const relativePath = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

export function npmGlobalInstallSource(args: {
  installed: boolean;
  executablePath: string | null;
  npmBin: string | null;
}): ProviderInstallationSource {
  return !args.installed
    ? "notInstalled"
    : args.executablePath !== null &&
        args.npmBin !== null &&
        pathIsInside(args.executablePath, args.npmBin)
      ? "npmGlobal"
      : "external";
}

export function installationVerification(
  status: Pick<ProviderInstallationStatus, "currentVersion" | "latestVersion">,
  action: "install" | "update",
): ProviderInstallationVerification {
  return action === "install"
    ? { kind: "installed" }
    : status.latestVersion !== null
      ? { kind: "version_at_least", version: status.latestVersion }
      : {
          kind: "version_changed",
          previousVersion: status.currentVersion ?? "unknown",
        };
}

export function downloadedInstallerCommand(
  url: string,
): ProviderInstallationCommand {
  const script = [
    'tmp=$(mktemp "${TMPDIR:-/tmp}/provider-installation.XXXXXX")',
    "trap 'rm -f \"$tmp\"' EXIT",
    `curl -fsSL ${url} -o "$tmp"`,
    'bash "$tmp"',
  ].join(" && ");
  return { command: "sh", args: ["-c", script], displayCommand: script };
}

export function clampPercent(value: number): number {
  return Math.min(
    100,
    Math.max(0, Math.round(Number.isFinite(value) ? value : 0)),
  );
}
