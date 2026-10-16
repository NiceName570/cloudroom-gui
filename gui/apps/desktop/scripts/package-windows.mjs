import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32")
  throw new Error("Build the Windows installer on Windows");
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(packageRoot, "package.json"));
const builderRequire = createRequire(
  require.resolve("electron-builder/package.json"),
);
const builderRoot = dirname(
  builderRequire.resolve("app-builder-lib/package.json"),
);
const templates = resolve(packageRoot, "../../../.windows-packager/templates");
await mkdir(templates, { recursive: true });
await cp(join(builderRoot, "templates"), templates, { recursive: true });
builderRequire("app-builder-lib/out/util/pathManager.js").getTemplatePath = (
  file,
) => join(templates, file);
process.chdir(packageRoot);
require("electron-builder/out/cli/cli.js");
