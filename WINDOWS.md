# Cloudroom Windows

Experimental Windows x64 port of davidondrej/cloudroom-gui. Upstream notices and Apache-2.0 licensing are preserved.

## Build

Use Windows 11 x64, Node.js 24, and Git for Windows. Run `Build Windows.cmd` from the repository root. The script uses the upstream pnpm 9.15.0 version and produces `gui/apps/desktop/release.noindex/installer.exe`.

The installer installs for the current user and adds desktop and Start menu shortcuts. It also adds **Cloudroom Windows Terminal** to the Start menu. That terminal provides PowerShell and a `room-cli` command. Run the desktop app before using CLI commands that need its local server. Agent CLIs and their provider logins remain separate prerequisites.

The integrated terminal uses Windows PowerShell and node-pty's Windows ConPTY implementation. Windows drive paths and UNC project paths are accepted. Native runtime dependencies are packaged with the app. SQLite is pinned consistently to 13.0.3, whose included Node-API binaries are verified during packaging. Its redundant node-gyp fallback is disabled; other dependency install scripts remain enabled.

## Limits

This is a local, unsigned development installer. Automatic updates are disabled for the Windows port. macOS computer control, macOS browser imports, POSIX environment lifecycle scripts, and cloud account access have not been validated for Windows. Passing build checks is not a claim that every upstream feature works on Windows.

The initial full Windows build and typecheck passed 56 Turbo tasks. The terminal suite passed 30 tests, with two POSIX execute-permission tests skipped on Windows. A real PowerShell terminal command returned the expected output. Project path tests passed 7 tests; selected desktop update tests passed 20 tests; server contracts passed 39 tests. The broader config/scripts suites still contain POSIX path assumptions. A plugin asset test also requires file-symlink privileges unavailable in this session.

The packaging wrapper copies the NSIS templates to `.windows-packager/` to stay within NSIS path-length limits when pnpm creates long dependency paths. The packaged app rendered its setup screen with the Windows desktop bridge. The packaged npm audit passed 348 dependency edges and offline install/update checks without modifying application resources. The terminal launcher passed `room-cli --help` through the bundled runtime.

Installation and packaged app results are recorded in the accompanying build verification report.

## Local workflow verification

The Windows-first README is now the fork's default front page. Source builds offer **Use local agents on Windows**, leaving cloud service authentication intact. A packaged-app test selected local mode, reloaded the renderer, and verified that setup stayed dismissed. The same package loaded seven Codex models and sixteen Claude models through its bundled CLI on the verification machine.

Native executable discovery now recognizes supported npm layouts and Windows executable suffixes. Five discovery regression tests pass, and live probes launched Codex 0.163.0 and Claude Code 2.1.295. CLI probe tests passed 41 checks, with four platform-specific skips. A real Windows launcher test verifies extensionless bundled scripts and literal arguments containing spaces and ampersands.

The first project-task demonstration found that the thread CLI treated backslash paths as environment IDs. The parser has been corrected; 39 spawn-helper tests pass, including drive, UNC, and relative Windows paths. Repackaging and end-to-end task verification follow that fix. The original development installer has not yet been replaced by this newer source build.
