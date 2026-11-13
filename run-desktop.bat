@echo off
cd /d "%~dp0"

set "RELEASE_EXE=%~dp0src-tauri\target\release\railmind-desktop.exe"

if "%1"=="--dev" goto run_dev

:: Release 版使用 frontendDist（../dist），不需要 3000 端口的 dev server。
if exist "%RELEASE_EXE%" (
    echo [RailMind] 正在啟動桌面端 (Release)...
    start "" "%RELEASE_EXE%"
    exit /b 0
)

echo [提示] 尚未構建 Release 正式版，正在以 Dev 模式啟動...
:run_dev
npm run desktop
pause
