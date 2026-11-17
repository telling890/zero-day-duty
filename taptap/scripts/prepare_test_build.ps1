#!/usr/bin/env pwsh
# 打一个 TapTap「PC 包体管理」可以直接上传的测试包。
#
# TapTap 要求：纯净包（不能有「下载 / 安装 / 获取」文案）、zip 或 7z、整目录打包、不用解压。
# 本项目是单文件 exe，天然合规。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File taptap\scripts\prepare_test_build.ps1
#   powershell -ExecutionPolicy Bypass -File taptap\scripts\prepare_test_build.ps1 -Exe .\dist\ZeroDayDuty.exe
#
# 产物：
#   taptap\test-build\零日值班_测试版_v1.6.0.zip   ← 上传这个
#   taptap\test-build\启动项.txt                  ← 后台「可执行文件」填这里面的值

param(
    [string]$Exe = "",
    [string]$Version = "v1.8.0"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outRoot = Join-Path $root "taptap\test-build"
$stage = Join-Path $outRoot "零日值班_测试版"

if (-not $Exe) {
    $candidates = @(
        (Join-Path $root "dist\零日值班\零日值班.exe"),
        (Join-Path $root "dist\ZeroDayDuty.exe")
    )
    $Exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Exe -or -not (Test-Path $Exe)) {
    throw "找不到可执行文件。先跑 build_exe.ps1，或用 -Exe 指定。"
}

Write-Host "== 来源 exe ==" -ForegroundColor Cyan
Write-Host "  $Exe"

Write-Host "== 重建 $stage ==" -ForegroundColor Cyan
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stage "saves") | Out-Null

Copy-Item $Exe (Join-Path $stage "零日值班.exe") -Force

$readme = Join-Path $root "packaging\portable_readme.txt"
if (Test-Path $readme) { Copy-Item $readme (Join-Path $stage "使用说明.txt") -Force }

$saveReadme = Join-Path $root "saves\README.txt"
if (Test-Path $saveReadme) { Copy-Item $saveReadme (Join-Path $stage "saves\README.txt") -Force }

# 给测试者的说明：装包、报错、反馈
$testerNote = @"
《零日值班》内部测试版 $Version
================================

怎么开始
1. 先在 Windows 上装 TapTap PC 版（taptap.cn 下载），用收到测试资格的账号登录
2. 在游戏页点「立即自测」，或使用开发者发给你的自测链接
3. 下载完成后直接启动，不需要安装任何运行库

本作不需要联网，存档写在游戏目录的 saves/ 文件夹里，删掉即可重置。

遇到问题请反馈这三件事
- 卡在哪一步（第几回合、哪个按钮）
- 屏幕上的提示文字（可以截图）
- 游戏目录里的 error.log（如果有）

注意：本作为虚构演示，所有公司、IP、数据均为虚构，不连接任何真实网络。
"@
Set-Content -Path (Join-Path $stage "测试说明.txt") -Value $testerNote -Encoding UTF8

# 后台要填的启动项：相对压缩包根目录的可执行文件路径
$launchLine = "零日值班.exe"
Set-Content -Path (Join-Path $outRoot "启动项.txt") -Value @"
TapTap 后台 → 商店 → PC 包体管理 → 包体管理 → 上传包体
  可执行文件（相对路径）：$launchLine
  操作系统：Windows
  版本号：$Version
  依赖库：无（单文件 exe，不需要额外运行库）
"@ -Encoding UTF8

Write-Host "== 打 zip ==" -ForegroundColor Cyan
$zip = Join-Path $outRoot "零日值班_测试版_$Version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Optimal

$exeSize = [math]::Round((Get-Item (Join-Path $stage "零日值班.exe")).Length / 1MB, 1)
$zipSize = [math]::Round((Get-Item $zip).Length / 1MB, 1)
$hash = (Get-FileHash (Join-Path $stage "零日值班.exe") -Algorithm SHA256).Hash

Write-Host ""
Write-Host "测试包就绪" -ForegroundColor Green
Write-Host "  上传这个：$zip（$zipSize MB）"
Write-Host "  启动项  ：$launchLine"
Write-Host "  exe 大小：$exeSize MB"
Write-Host "  SHA256  ：$hash"
Write-Host ""
Write-Host "下一步：后台 → 商店 → PC 包体管理 → 上传包体 → 填启动项" -ForegroundColor Yellow
Write-Host "        然后 商店 → 版本发布 → 测试 → 内部测试 → 创建计划并发资格" -ForegroundColor Yellow
