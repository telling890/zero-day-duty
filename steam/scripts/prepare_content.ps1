#!/usr/bin/env pwsh
# 把 dist\零日值班\ 组装成 SteamPipe 要上传的内容目录（steam\content\）。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File steam\scripts\prepare_content.ps1
#   powershell -ExecutionPolicy Bypass -File steam\scripts\prepare_content.ps1 -Exe .\dist\ZeroDayDuty.exe
#
# 产物：steam\content\
#   零日值班.exe          ← 启动项
#   使用说明.txt
#   saves\README.txt
#   steam_appid.txt      ← 只有本地调试需要，正式上传时会删掉

param(
    [string]$Exe = "",
    [switch]$KeepAppIdFile
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path (Join-Path $root "main.py"))) { $root = $PSScriptRoot | Split-Path -Parent | Split-Path -Parent }
$content = Join-Path $root "steam\content"

if (-not $Exe) {
    $candidates = @(
        (Join-Path $root "dist\零日值班\零日值班.exe"),
        (Join-Path $root "dist\ZeroDayDuty.exe")
    )
    $Exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Exe -or -not (Test-Path $Exe)) {
    throw "找不到可执行文件。先跑 build_exe.ps1，或用 -Exe 指定 exe 路径。"
}

Write-Host "== 来源 exe ==" -ForegroundColor Cyan
Write-Host "  $Exe"

Write-Host "== 清理并重建 steam\content ==" -ForegroundColor Cyan
if (Test-Path $content) { Remove-Item -Recurse -Force $content }
New-Item -ItemType Directory -Force -Path $content | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $content "saves") | Out-Null

Copy-Item $Exe (Join-Path $content "零日值班.exe") -Force

$readme = Join-Path $root "packaging\portable_readme.txt"
if (Test-Path $readme) {
    Copy-Item $readme (Join-Path $content "使用说明.txt") -Force
} else {
    Write-Warning "缺少 packaging\portable_readme.txt，跳过使用说明"
}

$saveReadme = Join-Path $root "saves\README.txt"
if (Test-Path $saveReadme) {
    Copy-Item $saveReadme (Join-Path $content "saves\README.txt") -Force
}

# 本地用 steam_appid.txt 才能让 Steamworks 初始化走测试模式；正式 depot 里不要带。
if ($KeepAppIdFile) {
    $appId = $env:STEAM_APP_ID
    if (-not $appId) { throw "设置了 -KeepAppIdFile 但没有 STEAM_APP_ID 环境变量" }
    Set-Content -Path (Join-Path $content "steam_appid.txt") -Value $appId -Encoding ASCII
    Write-Host "已写入 steam_appid.txt（$appId），正式上传前请删掉" -ForegroundColor Yellow
}

$exePath = Join-Path $content "零日值班.exe"
$sizeMb = [math]::Round((Get-Item $exePath).Length / 1MB, 1)
$hash = (Get-FileHash $exePath -Algorithm SHA256).Hash
$totalMb = [math]::Round((Get-ChildItem $content -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)

Write-Host ""
Write-Host "内容目录就绪：$content" -ForegroundColor Green
Write-Host "  启动 exe：$sizeMb MB"
Write-Host "  目录合计：$totalMb MB"
Write-Host "  SHA256：$hash"
Write-Host ""
Write-Host "下一步：steam\scripts\upload.ps1（需要先填 steam\build\ 里的 AppID / DepotID）" -ForegroundColor Yellow
