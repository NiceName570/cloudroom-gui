import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

assert.equal(process.platform, "win32");
const binary = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const port = 49381;
const serverUrl = "http://127.0.0.1:49382";
const env = {
  ...process.env,
  ROOM_DATA_DIR: join(output, "data"),
  BB_DESKTOP_OPEN_DEVTOOLS: "0",
  ROOM_SERVER_URL: serverUrl,
  ROOM_HOST_DAEMON_PORT: "49383",
  BB_TELEMETRY: "false",
};
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  binary,
  [
    `--user-data-dir=${join(output, "profile")}`,
    `--remote-debugging-port=${port}`,
  ],
  {
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
child.stdout.on("data", (chunk) => {
  logs += chunk;
});
child.stderr.on("data", (chunk) => {
  logs += chunk;
});
child.on("error", (error) => {
  logs += error.stack;
});
let socket;
try {
  let page;
  for (let attempt = 0; attempt < 120; attempt++) {
    const pages = await fetch(`http://127.0.0.1:${port}/json`)
      .then((r) => r.json())
      .catch(() => []);
    page = pages.find(
      (entry) => entry.type === "page" && entry.url.startsWith(serverUrl),
    );
    if (page) break;
    if (child.exitCode !== null) throw new Error(`App exited: ${logs}`);
    await delay(500);
  }
  assert.ok(page, `No application page became ready: ${logs}`);
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done, fail) => {
    socket.onopen = done;
    socket.onerror = fail;
  });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown")
      logs += JSON.stringify(message.params) + "\n";
    if (message.id) {
      const listener = pending.get(message.id);
      pending.delete(message.id);
      listener?.(message);
    }
  };
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      const id = ++nextId;
      const timeout = setTimeout(() => {
        pending.delete(id);
        fail(new Error(`CDP timed out: ${method}`));
      }, 10000);
      pending.set(id, (result) => {
        clearTimeout(timeout);
        result.error
          ? fail(new Error(JSON.stringify(result.error)))
          : done(result.result);
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send("Runtime.enable");
  let state;
  for (let attempt = 0; attempt < 60; attempt++) {
    state = await send("Runtime.evaluate", {
      expression:
        "JSON.stringify({title:document.title,text:document.body.innerText,rootChildren:document.querySelector('#root')?.childElementCount,desktopPlatform:window.bbDesktop?.platform})",
      returnByValue: true,
    });
    if (JSON.parse(state.result.value).rootChildren > 0) break;
    await delay(500);
  }
  let details = JSON.parse(state.result.value);
  if (process.argv.includes("--local")) {
    let choice;
    for (let attempt = 0; attempt < 60; attempt++) {
      choice = await send("Runtime.evaluate", {
        expression: `(() => { const button = Array.from(document.querySelectorAll('button')).find(element => element.textContent.trim() === 'Use local agents on Windows'); if (button) button.click(); return Boolean(button) || localStorage.getItem('cloudroom.setup.dismissed') === 'true'; })()`,
        returnByValue: true,
      });
      if (choice.result.value === true) break;
      await delay(500);
    }
    assert.equal(
      choice?.result.value,
      true,
      "No local-mode entry was available",
    );
    await delay(500);
    await send("Page.reload");
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await send("Runtime.evaluate", {
        expression: `JSON.stringify({title:document.title,text:document.body.innerText,rootChildren:document.querySelector('#root')?.childElementCount,desktopPlatform:window.bbDesktop?.platform,setupDismissed:localStorage.getItem('cloudroom.setup.dismissed'),executionTarget:localStorage.getItem('cloudroom.executionTarget'),setupOpen:Boolean(document.querySelector('[role="dialog"][aria-label="Set up Cloudroom"]'))})`,
        returnByValue: true,
      });
      if (typeof result.result?.value !== "string") {
        await delay(500);
        continue;
      }
      details = JSON.parse(result.result.value);
      if (details.rootChildren > 0 && !details.setupOpen) break;
      await delay(500);
    }
    assert.equal(details.setupDismissed, "true");
    assert.equal(details.executionTarget, "local");
    assert.equal(details.setupOpen, false);
  }
  if (process.argv.includes("--agents")) {
    const exec = promisify(execFile);
    const cli = join(
      dirname(binary),
      "resources",
      "app.asar.unpacked",
      "node_modules",
      "bb-app",
      "dist",
      "room-cli.js",
    );
    const agents = {};
    const hostId = (
      await readFile(join(output, "data", "host-id"), "utf8")
    ).trim();
    for (const provider of ["codex", "claude-code"]) {
      const result = await exec(
        binary,
        [
          cli,
          "provider",
          "models",
          provider,
          "--machine",
          hostId,
          ...(provider === "codex" ? ["--restart"] : []),
          "--json",
        ],
        {
          env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
          windowsHide: true,
          timeout: 60000,
          maxBuffer: 1024 * 1024,
        },
      );
      const models = JSON.parse(result.stdout);
      agents[provider] = models;
      assert.ok(
        Array.isArray(models) && models.length > 0,
        `${provider} returned no models`,
      );
      console.log(
        `${provider}: ${models.length} models through the packaged app`,
      );
    }
    await writeFile(
      join(output, "agents.json"),
      JSON.stringify(agents, null, 2),
    );
    if (process.argv.includes("--demo")) {
      const cliJson = async (...args) => {
        const result = await exec(binary, [cli, ...args, "--json"], {
          env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
          windowsHide: true,
          timeout: 30000,
          maxBuffer: 4 * 1024 * 1024,
        });
        return JSON.parse(result.stdout);
      };
      const demo = join(output, "demo-project");
      await mkdir(demo);
      await writeFile(
        join(demo, "README.md"),
        "# Windows capability demo\n\nA small local project for verifying a real coding task through Cloudroom.\n",
      );
      await writeFile(
        join(demo, "add.cjs"),
        "module.exports.add = (a, b) => 0;\n",
      );
      await exec("git", ["init", "-b", "main", demo], { windowsHide: true });
      await exec("git", ["-C", demo, "add", "README.md", "add.cjs"], {
        windowsHide: true,
      });
      await exec(
        "git",
        [
          "-C",
          demo,
          "-c",
          "user.name=Cloudroom Verification",
          "-c",
          "user.email=verification@example.invalid",
          "commit",
          "-m",
          "Seed Windows capability demo",
        ],
        { windowsHide: true },
      );
      const project = await cliJson(
        "project",
        "create",
        "--name",
        "Windows capability demo",
        "--root",
        demo,
        "--machine",
        hostId,
      );
      const thread = await cliJson(
        "thread",
        "spawn",
        "--project",
        project.id,
        "--environment",
        demo,
        "--machine",
        hostId,
        "--provider",
        "codex",
        "--permission-mode",
        "full",
        "--reasoning-level",
        "low",
        "--title",
        "Build and test on Windows",
        "--prompt",
        "Work only inside this demo repository. Fix add.cjs so its exported add(a,b) returns the sum of two numbers. Create add.test.cjs using node:test and node:assert/strict with positive, negative, and zero cases. Run node --test add.test.cjs and report the result. Do not install packages, access the network, modify other folders, or delegate to other agents.",
      );
      await writeFile(
        join(output, "demo-thread.json"),
        JSON.stringify({ project, thread }, null, 2),
      );
      await send("Page.navigate", {
        url: `${serverUrl}/projects/${project.id}/threads/${thread.id}`,
      });
      let completed = false;
      for (let attempt = 0; attempt < 36; attempt++) {
        await delay(5000);
        const state = await cliJson("thread", "show", thread.id);
        await writeFile(
          join(output, "demo-status.json"),
          JSON.stringify(state, null, 2),
        );
        if (state.thread.status === "error")
          throw new Error(
            `Demo thread failed: ${JSON.stringify(state.thread)}`,
          );
        if (
          state.thread.status === "idle" &&
          (await access(join(demo, "add.test.cjs")).then(
            () => true,
            () => false,
          ))
        ) {
          completed = true;
          break;
        }
      }
      assert.equal(
        completed,
        true,
        "The demo task did not complete within its verification window",
      );
      const test = await exec(
        process.execPath,
        ["--test", join(demo, "add.test.cjs")],
        { cwd: demo, windowsHide: true, timeout: 20000 },
      );
      await writeFile(
        join(output, "demo-tests.log"),
        test.stdout + test.stderr,
      );
      await exec(
        process.execPath,
        [
          "-e",
          "const {add}=require('./add.cjs'); if(add(12,30)!==42 || add(-5,2)!==-3 || add(0,0)!==0) process.exit(1)",
        ],
        { cwd: demo, windowsHide: true, timeout: 10000 },
      );
      const result = await cliJson("thread", "output", thread.id);
      await writeFile(
        join(output, "demo-output.json"),
        JSON.stringify(result, null, 2),
      );
      console.log(
        "Demo agent task completed; generated tests and independent arithmetic checks passed.",
      );
      await delay(1500);
      const page = await send("Runtime.evaluate", {
        expression:
          "JSON.stringify({title:document.title,text:document.body.innerText,rootChildren:document.querySelector('#root')?.childElementCount,desktopPlatform:window.bbDesktop?.platform})",
        returnByValue: true,
      });
      details = JSON.parse(page.result.value);
    }
  }
  await writeFile(join(output, "ui.json"), JSON.stringify(details, null, 2));
  const shot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(
    join(output, "desktop.png"),
    Buffer.from(shot.data, "base64"),
  );
  assert.equal(details.desktopPlatform, "windows");
  assert.ok(details.rootChildren > 0, "App root did not render");
  assert.ok(
    !/Unable to start|Could not start|Startup failed|Something went wrong/i.test(
      details.text,
    ),
    details.text,
  );
  console.log(JSON.stringify(details, null, 2));
} finally {
  socket?.close();
  if (child.exitCode === null && child.pid) {
    await new Promise((done) => {
      const stop = spawn(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" },
      );
      stop.on("exit", done);
      stop.on("error", done);
    });
  }
  await writeFile(join(output, "electron.log"), logs);
}
