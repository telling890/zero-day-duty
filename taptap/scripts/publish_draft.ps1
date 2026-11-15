#!/usr/bin/env pwsh
# 发布 TapTap 草稿版本：先提交资质审核，再提交版本审核。
#
# 这两步都是「高风险写操作」（不可逆、对平台公开），所以脚本默认只做只读检查，
# 必须显式加 -Confirm 才会真正提交。
#
# 用法：
#   # 1) 只看状态（只读，安全）
#   powershell -ExecutionPolicy Bypass -File taptap\scripts\publish_draft.ps1
#
#   # 2) 确认后真正提交
#   powershell -ExecutionPolicy Bypass -File taptap\scripts\publish_draft.ps1 -Confirm
#
#   # 顺带把新版本设为立即上线（默认 immediate）
#   ... -Confirm -Schedule immediate
#
# 前置：taptap-cli 已登录（taptap-cli auth login）

param(
    [switch]$Confirm,
    [ValidateSet("immediate")]
    [string]$Schedule = "immediate",
    [string]$DevId = "531375",
    [string]$AppId = "1064137"
)

$ErrorActionPreference = "Stop"

$cli = "C:\Users\lenovo\AppData\Local\pnpm\bin\taptap-cli.CMD"
if (-not (Test-Path $cli)) {
    $found = Get-Command taptap-cli -ErrorAction SilentlyContinue
    if (-not $found) { throw "找不到 taptap-cli。先安装：pnpm add -g @taptap/cli --registry=https://registry.npmjs.org/" }
    $cli = $found.Source
}

Write-Host "== 0. 登录与厂商 ==" -ForegroundColor Cyan
& $cli auth status | Select-Object -First 4

Write-Host "== 1. 版本状态 ==" -ForegroundColor Cyan
$versions = & $cli app list-versions --dev-id $DevId --app-id $AppId | Out-String | ConvertFrom-Json
$draft = $versions.data.result.list | Where-Object { $_.status -eq "draft" } | Select-Object -First 1
$online = $versions.data.result.list | Where-Object { $_.status -eq "online" }
if (-not $draft) {
    Write-Host "没有待发布的草稿版本；线上版本：" -ForegroundColor Yellow
    $online | ForEach-Object { "  $($_.version)  $($_.status_label)" }
    return
}
"  草稿: {0}（version_id {1}）" -f $draft.version, $draft.version_id
if ($online) { "  线上: {0}（{1}）" -f $online[0].version, $online[0].status_label }

Write-Host "== 2. 资质提交阻塞检查 ==" -ForegroundColor Cyan
$status = & $cli qualification get-status --dev-id $DevId --app-id $AppId | Out-String | ConvertFrom-Json
$snapshot = $status.data.result.snapshot
"  snapshot: $snapshot"
$blocked = @()
foreach ($req in $status.data.result.assessment.requirements) {
    if ($req.requirement -ne "required") { continue }
    $blockers = @($req.submit_blockers | Where-Object { $_ })
    "  {0,-22} {1,-10} {2}" -f $req.subject, $req.status, ($blockers -join "; ")
    if ($blockers.Count -gt 0) { $blocked += $req.subject }
}
if ($blocked.Count -gt 0) {
    throw ("这些资质还有提交阻塞，先补齐：" + ($blocked -join ", "))
}

Push-Location $payloadDir
Write-Host "== 3. 版本预检（只读） ==" -ForegroundColor Cyan
# --data 的文件路径必须落在当前工作目录内，所以写在 cli-payloads/ 下
$payloadDir = Join-Path (Split-Path -Parent $PSScriptRoot) "cli-payloads"
if (-not (Test-Path $payloadDir)) { New-Item -ItemType Directory -Force -Path $payloadDir | Out-Null }
$precheckFile = Join-Path $payloadDir "review-schedule.json"
# 必须无 BOM：CLI 会把带 BOM 的文件判为「invalid JSON」
$json = '{"release_schedule":{"kind":"' + $Schedule + '"}}'
[System.IO.File]::WriteAllText($precheckFile, $json, (New-Object System.Text.UTF8Encoding($false)))
$pre = & $cli app precheck-review --dev-id $DevId --app-id $AppId --data "@$precheckFile" | Out-String | ConvertFrom-Json
if (-not $pre.ok) { throw ("预检失败：" + $pre.error.message) }
$r = $pre.data.result
"  preaudit_status: {0}   blockers: {1}" -f $r.preaudit_status, $r.blockers.Count
$r.blockers | ForEach-Object { "  ✗ [$($_.code)] $($_.message)" }
$r.warnings | ForEach-Object { "  ! [$($_.code)] $($_.message)" }
if ($r.blockers.Count -gt 0) { throw "预检有阻塞项，先处理再发布" }

if (-not $Confirm) {
    Write-Host ""
    Write-Host "只读检查完成，一切就绪。" -ForegroundColor Yellow
    Write-Host "确认发布请加 -Confirm：这条会真正提交资质审核 + 版本审核（不可撤销）。" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "将要执行的命令：" -ForegroundColor DarkGray
    Write-Host "  taptap-cli qualification submit --data '@q-privacy.json' --yes"
    Write-Host "  taptap-cli qualification submit --data '@q-ai.json' --yes"
    Write-Host "  taptap-cli qualification submit --data '@q-anti-addiction.json' --yes"
    Write-Host "  taptap-cli qualification submit-age-grade --yes"
    Write-Host "  taptap-cli app submit-review --data '@precheck.json' --yes"
    return
}

Write-Host "== 4. 提交资质审核 ==" -ForegroundColor Cyan
foreach ($file in @("q-privacy.json", "q-ai.json", "q-anti-addiction.json")) {
    $path = Join-Path $payloadDir $file
    if (-not (Test-Path $path)) { throw "缺少 payload：$path" }
    $out = & $cli qualification submit --dev-id $DevId --app-id $AppId --data "@$path" --yes | Out-String | ConvertFrom-Json
    if ($out.ok) {
        "  {0,-24} 已提交（audit_id {1}）" -f $out.data.result.qualification_type, $out.data.result.audit_id
    } else {
        "  {0,-24} 失败：{1}" -f $file, $out.error.message
    }
    Start-Sleep -Milliseconds 800
}

Write-Host "== 5. 提交适龄分级 ==" -ForegroundColor Cyan
$out = & $cli qualification submit-age-grade --dev-id $DevId --app-id $AppId --yes | Out-String | ConvertFrom-Json
if ($out.ok) { "  适龄分级已提交" } else { "  适龄分级：$($out.error.message)" }

Write-Host "== 6. 提交版本审核 ==" -ForegroundColor Cyan
$out = & $cli app submit-review --dev-id $DevId --app-id $AppId --data "@$precheckFile" --yes | Out-String | ConvertFrom-Json
if ($out.ok) {
    "  已提交审核：version_id {0}" -f $out.data.version_id
    Write-Host ""
    Write-Host "提交完成。接下来：" -ForegroundColor Green
    Write-Host "  - 后台「版本」里可看审核状态（通常 1–3 个工作日）"
    Write-Host "  - 审核通过前，线上仍是上一个已上线版本，玩家看到的不受影响"
} else {
    throw ("提交失败：" + $out.error.message)
}
Pop-Location
