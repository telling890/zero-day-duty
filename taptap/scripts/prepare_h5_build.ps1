#!/usr/bin/env pwsh
# 把网页版（docs/play）打成 TapTap「H5 在线玩」备选包。
#
# 用途：如果 TapTap 的防沉迷要求卡住 PC 包（官方 SDK 只有 Unity/C++，Python 接不了），
#      改用 H5 在线玩，由平台容器承担启动校验与防沉迷。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File taptap\scripts\prepare_h5_build.ps1
#
# 产物：
#   taptap\h5-build\零日值班_h5_v1.6.0.zip   ← 网站根目录即 index.html
#   taptap\h5-build\自测说明.txt

param([string]$Version = "v1.6.0")

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$src = Join-Path $root "docs\play"
$outRoot = Join-Path $root "taptap\h5-build"
$stage = Join-Path $outRoot "h5"

if (-not (Test-Path (Join-Path $src "index.html"))) {
    throw "找不到 $src\index.html：先跑 node web\tools\sync-docs-play.mjs"
}

Write-Host "== 重建 $stage ==" -ForegroundColor Cyan
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

# 只带运行需要的静态文件（不包含测试截图等）
foreach ($item in @("index.html", "css", "js", "assets")) {
    $from = Join-Path $src $item
    if (Test-Path $from) { Copy-Item $from (Join-Path $stage $item) -Recurse -Force }
}

# 清掉仓库里的大截图，H5 包不需要
$shotDir = Join-Path $stage "assets\screenshots"
if (Test-Path $shotDir) { Remove-Item -Recurse -Force $shotDir }

$note = @"
《零日值班》H5 版 $Version —— 自测说明
================================

这是一个纯静态站点：压缩包根目录就是 index.html。

本地自测
1. 解压到任意目录
2. 在该目录执行：  py -3 -m http.server 8080
3. 浏览器打开：    http://localhost:8080/
   （不要直接双击 index.html，file:// 下部分浏览器会拦 fetch/localStorage）

如果要交给 TapTap 做「在线玩」
- 需要可公开访问的 https 地址；可以先把这套静态文件传到任意静态托管
  （GitHub Pages / 对象存储 / Nginx），把首页 URL 填到后台
- 项目自带的在线地址：https://telling890.github.io/zero-day-duty/play/

注意：本作不联网、不采集数据；存档在浏览器 localStorage。
"@
Set-Content -Path (Join-Path $outRoot "自测说明.txt") -Value $note -Encoding UTF8

Write-Host "== 打 zip ==" -ForegroundColor Cyan
$zip = Join-Path $outRoot "零日值班_h5_$Version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Optimal

$files = (Get-ChildItem $stage -Recurse -File | Measure-Object).Count
$kb = [math]::Round((Get-Item $zip).Length / 1KB, 0)

Write-Host ""
Write-Host "H5 包就绪" -ForegroundColor Green
Write-Host "  $zip（$kb KB，$files 个文件）"
Write-Host "  解压后根目录即 index.html"
Write-Host ""
Write-Host "自测：py -3 -m http.server 8080，然后开 http://localhost:8080/" -ForegroundColor Yellow
