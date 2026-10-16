@echo off
setlocal
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0Cloudroom Windows.exe" "%~dp0resources\app.asar.unpacked\node_modules\bb-app\host-daemon\dist\room-cli" %*
exit /b %errorlevel%
