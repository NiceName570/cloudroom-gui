import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  resolveBbAppStartContext,
  runBundledCliCommand,
} from "../src/launcher.js";

it.runIf(process.platform === "win32")(
  "launches the bundled extensionless CLI through Node and preserves arguments",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "cloudroom windows cli "));
    try {
      const marker = join(dir, "result.json");
      await writeFile(
        join(dir, "room-cli"),
        `require('node:fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify({args:process.argv.slice(2),dataDir:process.env.ROOM_DATA_DIR}));`,
      );
      const context = resolveBbAppStartContext({
        entrypointUrl: new URL("../src/launcher.ts", import.meta.url).href,
        env: { NODE_ENV: "production", BB_DATA_DIR: dir },
        homeDir: dir,
      });
      const args = ["status", "a path with spaces", "literal & echo text"];
      expect(
        await runBundledCliCommand({
          args,
          context: { ...context, daemonBundleDir: dir },
          env: { SystemRoot: process.env.SystemRoot },
        }),
      ).toBe(0);
      expect(JSON.parse(await readFile(marker, "utf8"))).toEqual({
        args,
        dataDir: dir,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
