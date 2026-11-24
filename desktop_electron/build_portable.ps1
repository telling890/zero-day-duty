# 桌面便携版（Electron，自带 Chromium）
#
# 和网页版共用同一套 UI：处置终端、自动化剧本、生活线、教程、主题全部一致。
# 产物是单文件 exe，目标电脑不需要 Python、不需要 WebView2、不需要联网。
#
# 用法（需要 Node.js 18+）：
#   powershell -ExecutionPolicy Bypass -File .\build_portable.ps1
#
# 产物：
#   dist\ZeroDayDuty.exe

$ErrorActionPreference = "Stop"

$here = $PSScriptRoot
$repo = Split-Path $here -Parent

Write-Host "== 复制网页版运行时 ==" -ForegroundColor Cyan
$webOut = Join-Path $here "web"
if (Test-Path $webOut) { Remove-Item $webOut -Recurse -Force }
New-Item -ItemType Directory -Force -Path $webOut | Out-Null
Copy-Item (Join-Path $repo "web\index.html"), (Join-Path $repo "web\README.md"),
          (Join-Path $repo "web\manifest.webmanifest"), (Join-Path $repo "web\sw.js") $webOut -Force
Copy-Item (Join-Path $repo "web\css"), (Join-Path $repo "web\js"), (Join-Path $repo "web\icons") $webOut -Recurse -Force

$assetsOut = Join-Path $here "assets"
New-Item -ItemType Directory -Force -Path $assetsOut | Out-Null
Copy-Item (Join-Path $repo "assets\icon.ico"), (Join-Path $repo "assets\icon.png") $assetsOut -Force

if (-not (Test-Path (Join-Path $here "node_modules"))) {
    Write-Host "== 安装 Electron 依赖 ==" -ForegroundColor Cyan
    Push-Location $here
    npm install
    Pop-Location
}

Write-Host "== 打包单文件便携版 ==" -ForegroundColor Cyan
Push-Location $here
# 某些环境会把 ELECTRON_RUN_AS_NODE=1 传进来，会让 electron 变成纯 Node，必须清掉
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
npx electron-builder --win portable --x64
Pop-Location

$built = Get-ChildItem (Join-Path $here "release") -Filter "*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $built) { throw "没有找到 electron-builder 产物" }

$distDir = Join-Path $repo "dist"
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
$final = Join-Path $distDir "ZeroDayDuty.exe"
Copy-Item $built.FullName $final -Force

$size = [math]::Round((Get-Item $final).Length / 1MB, 1)
$hash = (Get-FileHash $final -Algorithm SHA256).Hash
Write-Host ""
Write-Host "打包完成" -ForegroundColor Green
Write-Host "  可执行文件：$final"
Write-Host "  大小：$size MB"
Write-Host "  SHA256：$hash"
Write-Host "  自带 Chromium；目标电脑无需 Python / WebView2。" -ForegroundColor Yellow
