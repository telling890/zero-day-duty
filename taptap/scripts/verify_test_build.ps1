# 把上传用的 zip 解到临时目录，用硬超时跑一次 --selftest，验证「包本身」能不能跑
# 不动 dist、不动仓库，只读检查。

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$zip = Get-ChildItem (Join-Path $root "taptap\test-build") -Filter "*.zip" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $zip) { throw "没有找到测试包 zip，先跑 prepare_test_build.ps1" }

$work = Join-Path $env:TEMP ("zdd-tap-test-" + (Get-Date -Format "HHmmss"))
New-Item -ItemType Directory -Force -Path $work | Out-Null

Write-Host "== 解包到临时目录 ==" -ForegroundColor Cyan
Write-Host "  $($zip.FullName) -> $work"
Expand-Archive -Path $zip.FullName -DestinationPath $work -Force

$exe = Join-Path $work "零日值班.exe"
if (-not (Test-Path $exe)) { throw "解包后没有找到 零日值班.exe，包结构有问题" }

Write-Host "== 包内文件 ==" -ForegroundColor Cyan
Get-ChildItem $work -Recurse -File |
    Select-Object @{n='文件';e={$_.FullName.Replace($work + '\', '')}},
                  @{n='KB';e={[math]::Round($_.Length / 1KB, 1)}} |
    Format-Table -AutoSize

Write-Host "== 硬超时跑 --selftest（最多 30 秒） ==" -ForegroundColor Cyan
$env:SDL_VIDEODRIVER = "dummy"
$env:SDL_AUDIODRIVER = "dummy"

$start = Get-Date
$proc = Start-Process -FilePath $exe -ArgumentList "--selftest" -PassThru -WindowStyle Hidden
$deadline = (Get-Date).AddSeconds(30)
while (-not $proc.HasExited -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 250
}

$elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)

if ($proc.HasExited) {
    $code = $proc.ExitCode
    Write-Host ""
    if ($code -eq 0) {
        Write-Host "自检通过：退出码 0，耗时 $elapsed 秒" -ForegroundColor Green
    } else {
        Write-Host "自检失败：退出码 $code，耗时 $elapsed 秒" -ForegroundColor Red
    }
    $log = Join-Path $work "error.log"
    if (Test-Path $log) {
        Write-Host "找到 error.log：" -ForegroundColor Yellow
        Get-Content $log | Select-Object -First 20
    }
} else {
    Write-Host "超时 30 秒未退出，强制结束（PID $($proc.Id)）" -ForegroundColor Yellow
    $proc.Kill()
    $proc.WaitForExit()
    Write-Host "说明：这个环境下窗口/音频初始化可能阻塞，不代表玩家机器上会卡；" -ForegroundColor Yellow
    Write-Host "      但请在本机双击实测一次再上传。" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "临时目录（未删除，方便你复核）：$work" -ForegroundColor DarkGray
