# Windows completion checklist

The target is a fully functional Windows app with an accurate, clear GitHub showcase. A running Electron window alone does not complete this work.

## Installation and everyday work

- [x] Produce and install a per-user Windows x64 `installer.exe`.
- [x] Render the installed desktop app and expose its Windows bridge.
- [x] Run PowerShell through the integrated ConPTY terminal.
- [x] Provide a terminal shortcut and bundled `room-cli` launcher.
- [x] Accept Windows drive paths for projects.
- [ ] Complete first-run local setup without requiring a cloud account; verify that choice persists after restart.
- [ ] Create, open, edit, search, and review a real local Git project through the installed app.
- [ ] Verify native file/folder opening, editor integration, and Windows host identity.
- [ ] Verify setup/teardown hooks, worktrees, process cleanup, and app restart on Windows.

## Agents and workflows

- [x] Discover native Codex and Claude installations and load their model catalogs through the packaged app.
- [ ] Expose and verify actionable agent health/authentication status.
- [ ] Complete a real local agent task, including a tool execution and file change; verify the result independently.
- [ ] Verify follow-up messages, cancellation, history persistence, branching/forking, and recovery.
- [ ] Verify other advertised agents or clearly identify unsupported adapters before release.
- [ ] Verify browser/computer-control capabilities and their Windows permission boundaries.
- [ ] Verify cloud connectivity and supported local/cloud handoffs with an authorized account or self-hosted test core.

## Release and showcase

- [ ] Publish a Windows-first README with download, quick start, screenshots, capabilities, requirements, troubleshooting, and upstream attribution.
- [ ] Make that README visible on the fork's default branch.
- [ ] Publish an installer and checksums in a GitHub release after installed-app validation.
- [ ] Add reproducible Windows CI and resolve material Windows test failures.
- [ ] Capture a reproducible end-to-end capability demonstration; tie claims to its evidence.
- [ ] Audit this checklist against the actual release artifact before declaring completion.

Build logs and failed attempts remain in the parent Desktop folder. Cloud services and agent credentials are separate from local application access; local mode must not pretend to authenticate either service.
