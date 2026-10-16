import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";

export type KnownCli = "codex" | "claude" | "opencode" | "fx";

function isExecutableFile(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function isDanglingLink(candidate: string): boolean {
  try {
    return lstatSync(candidate).isSymbolicLink() && !existsSync(candidate);
  } catch {
    return false;
  }
}

function pathCandidates(cli: string, env: NodeJS.ProcessEnv): string[] {
  return (env.PATH ?? env.Path ?? "")
    .split(delimiter)
    .filter((dir) => isAbsolute(dir))
    .flatMap((dir) => executableCandidates(dir, cli));
}

function executableCandidates(dir: string, cli: string): string[] {
  if (process.platform !== "win32") return [join(dir, cli)];
  const modules = join(dir, "node_modules");
  const architecture = process.arch === "arm64" ? "arm64" : "x64";
  const native =
    cli === "claude"
      ? [join(modules, "@anthropic-ai", "claude-code", "bin", "claude.exe")]
      : cli === "codex"
        ? [modules, join(modules, "@openai", "codex", "node_modules")].flatMap(
            (root) => {
              const vendor = join(
                root,
                "@openai",
                `codex-win32-${architecture}`,
                "vendor",
                `${architecture === "arm64" ? "aarch64" : "x86_64"}-pc-windows-msvc`,
              );
              return [
                join(vendor, "bin", "codex.exe"),
                join(vendor, "codex", "codex.exe"),
              ];
            },
          )
        : [];
  return [join(dir, `${cli}.exe`), ...native, join(dir, `${cli}.com`)];
}

function codexAppBundlePaths(home: string): string[] {
  if (process.platform !== "darwin") return [];
  return ["/Applications", join(home, "Applications")].flatMap((apps) =>
    ["ChatGPT.app", "Codex.app"].flatMap((app) => {
      const resources = join(apps, app, "Contents", "Resources");
      return [
        join(resources, "codex-cli", "bin", "codex"),
        join(resources, "codex"),
      ];
    }),
  );
}

function homeDir(env: NodeJS.ProcessEnv): string {
  return env.HOME?.trim() || homedir();
}

/** Where OpenAI's official installer (chatgpt.com/codex/install.sh) puts Codex. */
export function officialCodexPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(
    env.CODEX_HOME?.trim() || join(homeDir(env), ".codex"),
    "packages",
    "standalone",
    "current",
    process.platform === "win32" ? "codex.exe" : "codex",
  );
}

function fallbackCandidates(cli: string, env: NodeJS.ProcessEnv): string[] {
  if (process.getuid?.() === 0) return [];
  const home = homeDir(env);
  const binDirs = [
    join(home, ".local", "bin"),
    ...(process.platform === "win32"
      ? [join(env.APPDATA ?? join(home, "AppData", "Roaming"), "npm")]
      : []),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/home/linuxbrew/.linuxbrew/bin",
    join(home, ".bun", "bin"),
    join(home, ".npm-global", "bin"),
    join(home, ".volta", "bin"),
  ];
  const providerPaths =
    cli === "codex"
      ? codexAppBundlePaths(home)
      : cli === "opencode"
        ? [join(home, ".opencode", "bin", "opencode")]
        : cli === "claude"
          ? [join(home, ".claude", "local", "claude")]
          : cli === "grok"
            ? [join(home, ".grok", "bin", "grok")]
            : [];
  return [
    ...binDirs.flatMap((dir) => executableCandidates(dir, cli)),
    ...providerPaths,
  ];
}

export function findCliExecutable(
  cli: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  // OpenAI's official Codex wins over PATH: it is the one copy we can always
  // update, however tangled the Mac's npm or Homebrew copies are.
  const official =
    cli === "codex" && process.getuid?.() !== 0 ? [officialCodexPath(env)] : [];
  return (
    [
      ...official,
      ...pathCandidates(cli, env),
      ...fallbackCandidates(cli, env),
    ].find(isExecutableFile) ?? null
  );
}

export function findBrokenCliLink(
  cli: KnownCli,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return pathCandidates(cli, env).find(isDanglingLink) ?? null;
}
