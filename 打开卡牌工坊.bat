@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "ROOT=%~dp0"
set "NODE_HOME=%ROOT%vendor\node"
set "NODE_ZIP="

if exist "%NODE_HOME%\node.exe" goto :have_node

for %%Z in ("%ROOT%vendor\node-v*-win-x64.zip") do (
  if exist "%%~Z" set "NODE_ZIP=%%~Z"
)

if not defined NODE_ZIP goto :have_node

echo 正在安装包体内置 Node.js（不需要外网）…
if exist "%ROOT%vendor\_node_extract" rmdir /s /q "%ROOT%vendor\_node_extract"
mkdir "%ROOT%vendor\_node_extract" >nul 2>nul
tar -xf "%NODE_ZIP%" -C "%ROOT%vendor\_node_extract"
if errorlevel 1 (
  echo 展开 Node.js 失败。
  pause
  exit /b 1
)
for /d %%D in ("%ROOT%vendor\_node_extract\node-v*-win-x64") do (
  if exist "%NODE_HOME%" rmdir /s /q "%NODE_HOME%"
  move "%%~D" "%NODE_HOME%" >nul
)
rmdir /s /q "%ROOT%vendor\_node_extract" >nul 2>nul

:have_node
if exist "%NODE_HOME%\node.exe" (
  set "PATH=%NODE_HOME%;%PATH%"
  echo 使用内置 Node.js
)

where node >nul 2>nul
if errorlevel 1 (
  echo 没找到 Node.js。请使用完整离线包（里面有 vendor\node），或把 Node 放到 vendor\node。
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo 第一次打开，正在安装依赖（国内镜像，不需要 VPN）…
  call npm install --registry=https://registry.npmmirror.com
  if errorlevel 1 (
    echo 安装失败。完整离线包应已带 node_modules；或检查网络后重试。
    pause
    exit /b 1
  )
)

echo.
netsh advfirewall firewall add rule name="TMD LAN 1420" dir=in action=allow protocol=TCP localport=1420 >nul 2>&1
if errorlevel 1 (
  echo [提示] 未能自动放行防火墙。另一台电脑打不开时，请用「管理员」命令提示符运行：
  echo   netsh advfirewall firewall add rule name="TMD LAN 1420" dir=in action=allow protocol=TCP localport=1420
)
node "%ROOT%scripts\print-lan.mjs"
if exist "%ROOT%VERSION.txt" (
  echo.
  echo 版本文件：VERSION.txt
)
echo 不要关这个黑窗口。
echo.

powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue; if (-not $c) { exit 2 }; $lan = @($c | Where-Object { $_.LocalAddress -ne '127.0.0.1' -and $_.LocalAddress -ne '::1' }); if ($lan.Count -gt 0) { exit 0 }; $c | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; exit 3"
if %ERRORLEVEL%==0 (
  echo 局域网服务已在运行，正在打开浏览器…
  start "" "http://localhost:1420/"
  echo 对方请打开上面打印的 http://局域网IP:1420/ ，不要再启动一份工坊。
  pause
  exit /b 0
)
if %ERRORLEVEL%==3 (
  echo 检测到旧服务只绑了本机，已关掉，正在按局域网方式重启…
  timeout /t 1 /nobreak >nul
)

call npm run start
if errorlevel 1 (
  echo.
  echo 启动失败。常见原因：1420 端口被占用，或依赖没装完。
  echo 可关掉所有黑窗口后再试，或在浏览器打开 http://localhost:1420/
  pause
)
