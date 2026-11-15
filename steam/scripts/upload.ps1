#!/usr/bin/env pwsh
# 用 steamcmd 把 steam\content\ 上传成 SteamPipe 构建。
#
# 前置：
#   1. 已有 Steamworks 合作伙伴账号，且该 App 已创建（拿到 AppID / DepotID）
#   2. steam\build\app_build.vdf 与 depot_build.vdf 里的占位符已替换
#   3. steam\scripts\prepare_content.ps1 已跑过
#
# 用法：
#   $env:STEAM_USER = "your_login"
#   $env:STEAM_APP_ID = "1234560"; $env:STEAM_DEPOT_ID = "1234561"
#   powershell -ExecutionPolicy Bypass -File steam\scripts\upload.ps1
#   可选：-Desc "v1.6.0 首发"  -SteamCmd "C:\steamcmd\steamcmd.exe"
#
# 上传只是把构建推到 Steam 后台；还要去 Steamworks → 该 App → SteamPipe → Builds
# 里把这次构建设为 Live（或挂到 beta 分支）。

param(
    [string]$Desc = "",
    [string]$SteamCmd = "",
    [string]$Branch = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$buildDir = Join-Path $root "steam\build"
$appVdf = Join-Path $buildDir "app_build.vdf"
$contentDir = Join-Path $root "steam\content"

if (-not (Test-Path $contentDir)) {
    throw "还没有 steam\content：先跑 steam\scripts\prepare_content.ps1"
}
if (-not (Test-Path $appVdf)) {
    throw "找不到 $appVdf"
}
if ((Get-Content $appVdf -Raw) -match "APPID_PLACEHOLDER|DEPOTID_PLACEHOLDER") {
    throw "app_build.vdf 里还是占位符：先把 AppID / DepotID 换成真实值"
}

if (-not $SteamCmd) {
    $candidates = @(
        $env:STEAMCMD_PATH,
        "C:\steamcmd\steamcmd.exe",
        "D:\steamcmd\steamcmd.exe",
        (Join-Path $env:LOCALAPPDATA "steamcmd\steamcmd.exe")
    ) | Where-Object { $_ }
    $SteamCmd = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $SteamCmd -or -not (Test-Path $SteamCmd)) {
    Write-Host "没找到 steamcmd.exe。" -ForegroundColor Yellow
    Write-Host "下载：https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip"
    Write-Host "解压到 C:\steamcmd 后重跑，或用 -SteamCmd 指定路径。"
    throw "steamcmd 未就绪"
}

if (-not $env:STEAM_USER) {
    throw "请先设置 `$env:STEAM_USER（有该 App 权限的 Steamworks 账号登录名）"
}

if ($Desc) {
    # 覆盖构建描述，方便在后台区分版本
    $text = Get-Content $appVdf -Raw
    $text = [regex]::Replace($text, '("Desc"\s+)"[^"]*"', ('$1"' + $Desc + '"'))
    Set-Content -Path $appVdf -Value $text -Encoding UTF8 -NoNewline
    Write-Host "构建描述：$Desc" -ForegroundColor Cyan
}

$args = @("+login", $env:STEAM_USER)
if ($Branch) {
    # 想直接挂到 beta 分支时，用 +build_upload 的分支参数（可选）
    Write-Host "分支：$Branch" -ForegroundColor Cyan
}
$args += @("+run_app_build", "`"$appVdf`"", "+quit")

Write-Host ""
Write-Host "== steamcmd 上传 ==" -ForegroundColor Cyan
Write-Host "  $SteamCmd $($args -join ' ')"
Write-Host "（若开了 Steam Guard，会在此处要求输入邮箱/手机验证码）" -ForegroundColor Yellow
Write-Host ""

& $SteamCmd @args
$code = $LASTEXITCODE

$log = Join-Path $buildDir "output"
if (Test-Path $log) {
    Get-ChildItem $log -Recurse -File -Filter *.log -ErrorAction SilentlyContinue |
        Select-Object -First 3 |
        ForEach-Object { Write-Host "日志：$($_.FullName)" }
}

if ($code -ne 0) {
    throw "steamcmd 退出码 $code，上传失败，看日志排查"
}

Write-Host ""
Write-Host "上传完成。接下来：" -ForegroundColor Green
Write-Host "  1. Steamworks → SteamPipe → Builds，确认新 build 出现"
Write-Host "  2. 设为 Live（正式）或挂到 beta 分支先自测"
Write-Host "  3. 用 Steam 客户端里已授权的账号安装并跑一遍冒烟测试"
