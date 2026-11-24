# 打包「桌面完整版」：WebView2 原生窗口 + 和网页版同一套 UI（终端 / 剧本 / 生活线 / 教程）。
#
# 用法（在项目根目录）：
#   powershell -ExecutionPolicy Bypass -File .\build_webview.ps1
#
# 依赖：
#   py -3.10 -m pip install -r requirements-webview.txt
#
# 产物：
#   dist\webview\ZeroDayDutyDesktop.exe

$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
Set-Location $root

Write-Host "== 检查 Python / pywebview ==" -ForegroundColor Cyan
& py -3.10 -c "import sys, webview; print('Python', sys.version.split()[0]); print('pywebview OK')"
if ($LASTEXITCODE -ne 0) {
    throw "缺少依赖，请先执行：py -3.10 -m pip install -r requirements-webview.txt"
}

$tmp = Join-Path $env:TEMP "zdd-desktop-webview-build"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
$webOut = Join-Path $tmp "web"
New-Item -ItemType Directory -Force -Path $webOut | Out-Null

Write-Host "== 复制网页版运行时（不含测试与截图） ==" -ForegroundColor Cyan
Copy-Item "web\index.html", "web\README.md", "web\manifest.webmanifest", "web\sw.js" $webOut -Force
Copy-Item "web\css", "web\js", "web\icons" $webOut -Recurse -Force

$versionSrc = Join-Path $root "packaging\version_info.txt"
$versionOut = Join-Path $tmp "version_info.txt"
$versionText = Get-Content $versionSrc -Raw -Encoding UTF8
$versionText = $versionText.Replace("1, 8, 0, 0", "1, 9, 0, 0")
$versionText = $versionText.Replace("'1.8.0.0'", "'1.9.0.0'")
$versionText = $versionText.Replace("'零日值班.exe'", "'零日值班-桌面完整版.exe'")
$versionText = $versionText.Replace("'零日值班：网络安全防御模拟器'", "'零日值班：网络安全防御模拟器（桌面完整版）'")
Set-Content -Path $versionOut -Value $versionText -Encoding UTF8
# Windows PowerShell 5.1 的 Set-Content 会带 BOM；PyInstaller 的版本文件改成无 BOM 更稳
[IO.File]::WriteAllText($versionOut, [IO.File]::ReadAllText($versionOut), (New-Object Text.UTF8Encoding($false)))

Write-Host "== PyInstaller 打包（单文件、无控制台） ==" -ForegroundColor Cyan
$iconIco = Join-Path $root "assets\icon.ico"
$iconPng = Join-Path $root "assets\icon.png"
$mainPy = Join-Path $root "desktop_webview.py"
$distOut = Join-Path $tmp "dist"
$workOut = Join-Path $tmp "work"
$specOut = Join-Path $tmp "spec"
& py -3.10 -m PyInstaller --noconfirm --clean --onefile --windowed `
    --name ZeroDayDutyDesktop `
    --icon $iconIco `
    --add-data "$webOut;web" `
    --add-data "$iconPng;assets" `
    --hidden-import webview.platforms.edgechromium `
    --collect-submodules webview `
    --collect-submodules clr_loader `
    --collect-all webview `
    --version-file $versionOut `
    --distpath $distOut `
    --workpath $workOut `
    --specpath $specOut `
    $mainPy
if ($LASTEXITCODE -ne 0) { throw "PyInstaller 打包失败" }

$builtExe = Join-Path $distOut "ZeroDayDutyDesktop.exe"
Write-Host "== 运行 exe 自检 ==" -ForegroundColor Cyan
$process = Start-Process -FilePath $builtExe -ArgumentList "--selftest" -PassThru -WindowStyle Hidden
if (-not $process.WaitForExit(60000)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "打包后的 exe 自检超时（60 秒）"
}
Write-Host "自检退出码：$($process.ExitCode)"
if ($process.ExitCode -ne 0) { throw "打包后的 exe 自检失败" }

$finalDir = Join-Path $root "dist\webview"
New-Item -ItemType Directory -Force -Path $finalDir | Out-Null
$finalExe = Join-Path $finalDir "ZeroDayDutyDesktop.exe"
Copy-Item $builtExe $finalExe -Force

$size = [math]::Round((Get-Item $finalExe).Length / 1MB, 1)
$hash = (Get-FileHash $finalExe -Algorithm SHA256).Hash
Write-Host ""
Write-Host "打包完成" -ForegroundColor Green
Write-Host "  可执行文件：$finalExe"
Write-Host "  大小：$size MB"
Write-Host "  SHA256：$hash"
Write-Host "  需要 Windows 10/11 自带的 WebView2 运行时（Edge 同源）。" -ForegroundColor Yellow
