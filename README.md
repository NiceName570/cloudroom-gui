# Cloudroom for Windows

**Your coding agents. Your projects. One Windows workspace.**

A native Windows port of [Cloudroom](https://github.com/davidondrej/cloudroom-gui), bringing its Electron desktop, project workspace, PowerShell terminal, and agent integrations to Windows 11.

[Build and install](#build-and-install) · [Capabilities](#what-you-can-do) · [Verification](#tested-not-just-packaged) · [Completion checklist](WINDOWS-ROADMAP.md) · [Upstream](UPSTREAM-README.md)

## Why this fork exists

The upstream desktop releases support macOS and Linux. This fork makes Windows a first-class development target: a real `installer.exe`, Windows paths, ConPTY terminals, native agent discovery, and a local workflow that does not require a Cloudroom account.

The aim is a complete coding workspace: give an agent a task, watch its progress, inspect the files and Git changes, and keep a terminal beside the work. Your existing agent subscriptions and logins stay with their providers.

**Free models with Thoth:** Cloudroom runs [Hermes Agent](https://hermes-agent.nousresearch.com)-based agents through ACP, so [Thoth](https://github.com/NiceName570/thoth-), a Hermes fork with an API Keys page and free-model rotation, can serve as the agent here without any Cloudroom code changes. Cloudroom's Hermes Agent connection is verified with the upstream Hermes build; running Thoth itself is not yet verified.

**Release status:** Windows development preview. Installation, desktop rendering, PowerShell execution, and the CLI have been verified. Full agent workflows and the remaining Windows integrations are being validated against the [completion checklist](WINDOWS-ROADMAP.md). This README separates working evidence from the release target.

## What you can do

| Capability | Windows status |
| --- | --- |
| Install a desktop app with Start menu and desktop shortcuts | Installed and launched on Windows 11 x64 |
| Run PowerShell in the integrated terminal | Real command execution verified through ConPTY |
| Use `room-cli` from the supplied terminal | Installed CLI verified; no separate Node installation needed to run it |
| Work with native Windows project paths | Drive paths and UNC paths accepted by validation |
| Detect installed Codex and Claude Code | Native discovery verified; both model catalogs loaded through the packaged app |
| Start local work without Cloudroom sign-in | Packaged app verified; local choice survives page reload |
| Agent tasks, file edits, worktrees, history, cancellation, and recovery | End-to-end Windows verification in progress |
| Cloud handoff and computer control | Not yet verified on Windows; do not assume macOS feature parity |

## Build and install

### Requirements

- Windows 11, x64.
- Node.js 24 and Git for Windows to **build from source**.
- A supported agent CLI and its provider login to run AI tasks.

The packaged app includes its desktop runtime, local database, and CLI runtime. WSL is not required for the native desktop or PowerShell terminal.

```powershell
git clone --branch windows-port https://github.com/NiceName570/cloudroom-gui.git
cd cloudroom-gui
.\'Build Windows.cmd'
```

The build produces:

```text
gui\apps\desktop\release.noindex\installer.exe
```

Run `installer.exe` and choose an installation folder. It installs for your user and creates **Cloudroom Windows** and **Cloudroom Windows Terminal** shortcuts. The development installer is unsigned.

### First use

1. Open **Cloudroom Windows**.
2. In current source builds, choose **Use local agents on Windows** for local work, or sign in if you want cloud services. The original development installer predates this option; the refreshed installer is being validated.
3. Connect an installed agent in Settings and open a project folder.
4. Use the integrated PowerShell terminal, or open **Cloudroom Windows Terminal** from Start.

```powershell
room-cli --help
room-cli status
room-cli project list
```

Cloud services still require their own account and access. Local mode does not authenticate you to a model provider or grant cloud access.

## Tested, not just packaged

The initial Windows build passed **56 build/typecheck tasks**. Verification includes:

- Real PowerShell output through `node-pty`/ConPTY.
- Installed desktop rendering and a Windows desktop bridge.
- Installed CLI commands.
- Windows project-path and server-contract tests.
- Packaged SQLite executing a real database query.
- Offline plugin dependency installation and updates through the bundled runtime, with application resources unchanged.
- Native Codex and Claude executable discovery, including npm installations in paths containing spaces.
- Packaged model discovery returned seven Codex models and sixteen Claude models on the verification machine.
- Local setup dismissal persisted across a real renderer reload.

Windows-specific regression tests are being added as gaps are fixed. Some upstream suites still assume POSIX paths or Unix execute permissions. See [Windows notes](WINDOWS.md) for checks and limitations; see the [checklist](WINDOWS-ROADMAP.md) for the remaining release gates.

## Troubleshooting

**An agent is missing:** Install and sign in to that agent's Windows CLI, then restart Cloudroom. Detection supports native executables and the native binaries inside supported npm installations. A provider listed in the UI is not proof that its login is ready.

**`room-cli` is not recognized:** Open **Cloudroom Windows Terminal**. Its launcher adds the app directory to PATH for that terminal session.

**The CLI cannot reach the server:** Open the desktop app first. The local server listens on loopback; `room-cli status` shows its address.

**An upstream feature fails on Windows:** Check the [completion checklist](WINDOWS-ROADMAP.md) and [open a fork issue](https://github.com/NiceName570/cloudroom-gui/issues) with the action, expected result, and error. Remove credentials before sharing logs.

## Attribution and license

This is an independent Windows fork, not an official Windows release from Cloudroom's authors. The original app, architecture, and agent integrations come from [davidondrej/cloudroom-gui](https://github.com/davidondrej/cloudroom-gui), built on [BB](https://github.com/get-bb/bb). Windows port work lives on this fork's `windows-port` branch.

Licensed under [Apache 2.0](LICENSE). Existing third-party notices, including BB's MIT notice in [NOTICE](NOTICE), are preserved. The original project introduction is retained in [UPSTREAM-README.md](UPSTREAM-README.md).
