import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { HostDaemonDaemonWsMessage } from "@cloudroom/host-daemon-contract";
import { RuntimeManager } from "../runtime-manager.js";
import { TerminalManager } from "./terminal-manager.js";

it.skipIf(process.platform !== "win32")(
  "runs PowerShell commands through a real Windows terminal",
  async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cloudroom-windows-terminal-"));
    const messages: HostDaemonDaemonWsMessage[] = [];
    const manager = new TerminalManager({
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      runtimeManager: new RuntimeManager({
        createRuntime: () => {
          throw new Error("No agent expected");
        },
        provisionWorkspace: async () => {
          throw new Error("No workspace expected");
        },
      }),
      sendMessage: (message) => {
        messages.push(message);
        return true;
      },
    });
    try {
      await manager.handleMessage({
        type: "terminal.open",
        contributedEnv: [],
        requestId: "windows-open",
        terminalId: "windows-terminal",
        target: { kind: "host_path", cwd },
        cols: 100,
        rows: 30,
        start: {
          mode: "command",
          command: "Write-Output ('WINDOWS_PTY_' + (6 * 7))",
        },
      });
      await expect
        .poll(
          () =>
            messages.some(
              (message) =>
                message.type === "terminal.output" &&
                Buffer.from(message.chunk.dataBase64, "base64")
                  .toString("utf8")
                  .includes("WINDOWS_PTY_42"),
            ),
          { timeout: 15000 },
        )
        .toBe(true);
      expect(
        messages.some((message) => message.type === "terminal.error"),
      ).toBe(false);
    } finally {
      await manager.shutdownAll();
      await rm(cwd, { recursive: true, force: true });
    }
  },
  20000,
);
