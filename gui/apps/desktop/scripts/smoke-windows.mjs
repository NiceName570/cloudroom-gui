import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
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
      (entry) =>
        entry.type === "page" && entry.url.startsWith(serverUrl),
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
    const choice = await send("Runtime.evaluate", {
      expression: `(() => { const button = Array.from(document.querySelectorAll('button')).find(element => element.textContent.trim() === 'Use local agents on Windows'); if (button) button.click(); return Boolean(button) || localStorage.getItem('cloudroom.setup.dismissed') === 'true'; })()`,
      returnByValue: true,
    });
    assert.equal(choice.result.value, true, "No local-mode entry was available");
    await delay(500);
    await send("Page.reload");
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await send("Runtime.evaluate", {
        expression: `JSON.stringify({title:document.title,text:document.body.innerText,rootChildren:document.querySelector('#root')?.childElementCount,desktopPlatform:window.bbDesktop?.platform,setupDismissed:localStorage.getItem('cloudroom.setup.dismissed'),executionTarget:localStorage.getItem('cloudroom.executionTarget'),setupOpen:Boolean(document.querySelector('[aria-label="Set up Cloudroom"]'))})`,
        returnByValue: true,
      });
      details = JSON.parse(result.result.value);
      if (details.rootChildren > 0 && !details.setupOpen) break;
      await delay(500);
    }
    assert.equal(details.setupDismissed, "true");
    assert.equal(details.executionTarget, "local");
    assert.equal(details.setupOpen, false);
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
