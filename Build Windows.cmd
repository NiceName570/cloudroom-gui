@echo off
setlocal
cd /d "%~dp0gui"
call npx --yes pnpm@9.15.0 install --frozen-lockfile
if errorlevel 1 exit /b %errorlevel%
call npx --yes pnpm@9.15.0 exec turbo run build --filter=bb-app --filter=@cloudroom/desktop --concurrency=2
if errorlevel 1 exit /b %errorlevel%
call npx --yes pnpm@9.15.0 --filter @cloudroom/desktop exec node scripts/package-windows.mjs --config electron-builder.windows.json --win nsis --x64 --publish never
exit /b %errorlevel%
