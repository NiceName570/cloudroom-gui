import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findCliExecutable, officialCodexPath } from "../src/cli-locations.js";

describe.runIf(process.platform === "win32")("Windows agent discovery", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0))
      rmSync(root, { recursive: true, force: true });
  });
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "cloudroom cli "));
    roots.push(root);
    const bin = join(root, "npm tools");
    mkdirSync(bin);
    return {
      root,
      bin,
      env: {
        PATH: bin,
        HOME: root,
        APPDATA: root,
        CODEX_HOME: join(root, ".codex"),
      },
    };
  }
  function file(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "fixture");
    return path;
  }
  it("finds a native executable in a PATH directory containing spaces", () => {
    const { bin, env } = fixture();
    const executable = file(join(bin, "claude.exe"));
    expect(findCliExecutable("claude", env)).toBe(executable);
  });
  it("uses the npm-installed Claude executable instead of its Unix shim", () => {
    const { bin, env } = fixture();
    file(join(bin, "claude"));
    file(join(bin, "claude.cmd"));
    const executable = file(
      join(
        bin,
        "node_modules",
        "@anthropic-ai",
        "claude-code",
        "bin",
        "claude.exe",
      ),
    );
    expect(findCliExecutable("claude", env)).toBe(executable);
  });
  it("finds Codex's nested native platform package", () => {
    const { bin, env } = fixture();
    file(join(bin, "codex"));
    const architecture = process.arch === "arm64" ? "arm64" : "x64";
    const target = architecture === "arm64" ? "aarch64" : "x86_64";
    const executable = file(
      join(
        bin,
        "node_modules",
        "@openai",
        "codex",
        "node_modules",
        "@openai",
        `codex-win32-${architecture}`,
        "vendor",
        `${target}-pc-windows-msvc`,
        "bin",
        "codex.exe",
      ),
    );
    expect(findCliExecutable("codex", env)).toBe(executable);
  });
  it("prefers the official standalone Codex executable", () => {
    const { bin, env } = fixture();
    file(join(bin, "codex.exe"));
    const executable = file(officialCodexPath(env));
    expect(findCliExecutable("codex", env)).toBe(executable);
  });
  it("does not advertise an unlaunchable Unix shim as a Windows executable", () => {
    const { bin, env } = fixture();
    file(join(bin, "codex"));
    expect(findCliExecutable("codex", env)).toBeNull();
  });
});
