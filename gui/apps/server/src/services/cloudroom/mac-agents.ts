import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { findCliExecutable } from "@cloudroom/process-utils";
import { macCursorLogin, macOpencodeLogin } from "./sandboxes.js";

const json = (path: string) => readFile(path, "utf8").then(text => JSON.parse(text) as unknown, () => null);
const filled = (value: unknown) => Boolean(value && typeof value === "object" && Object.values(value).some(entry => Array.isArray(entry) ? entry.length : entry));
const hasText = (path: string) => readFile(path, "utf8").then(text => text.trim() !== "", () => false);

async function hermesSignedIn(): Promise<boolean> {
  const home = process.env.HERMES_HOME || join(homedir(), ".hermes");
  const auth = await json(join(home, "auth.json")) as { providers?: unknown; credential_pool?: unknown } | null;
  if (filled(auth?.providers) || filled(auth?.credential_pool)) return true;
  return /^\s*[A-Z0-9_]*(API_KEY|TOKEN)\s*=\s*\S/m.test(await readFile(join(home, ".env"), "utf8").catch(() => ""));
}

/** Agents besides Claude Code and Codex, by provider ID: the CLI that runs them and how to tell they're signed in here. */
const AGENTS: [id: string, cli: string, signedIn: () => Promise<boolean>][] = [
  ["pi", "pi", async () => filled(await json(join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi/agent"), "auth.json")))],
  ["acp-opencode", "opencode", async () => (await macOpencodeLogin()) !== null],
  ["acp-cursor", "cursor-agent", async () => Boolean(process.env.CURSOR_API_KEY) || (await macCursorLogin()) !== null],
  ["acp-hermes-agent", "hermes", hermesSignedIn],
  ["acp-grok", "grok", async () => Boolean(process.env.XAI_API_KEY) || hasText(join(process.env.GROK_HOME || join(homedir(), ".grok"), "auth.json"))],
  ["acp-devin", "devin", () => hasText(join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "devin", "credentials.toml"))],
];

/** The extra agents installed and signed in on this computer, most used first, so setup can offer them.
 *  A missed login only hides that agent's choice; it never blocks the agent elsewhere. */
export async function macSignedInAgents(): Promise<string[]> {
  const found = await Promise.all(AGENTS.map(async ([id, cli, signedIn]) => findCliExecutable(cli) && await signedIn().catch(() => false) ? id : null));
  return found.filter(id => id !== null);
}
