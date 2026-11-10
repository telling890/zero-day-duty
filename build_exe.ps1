# 将《零日值班》打包为 Windows 单文件应用，并生成可直接分发的文件夹与 zip。
#
# 用法（在项目根目录或任意目录）：
#   powershell -ExecutionPolicy Bypass -File .\build_exe.ps1
#
# 依赖：
#   py -3.10 -m pip install pygame pyinstaller pillow
#
# 产物：
#   dist\零日值班\零日值班.exe        ← 双击启动
#   dist\零日值班\使用说明.txt
#   dist\零日值班\saves\
#   dist\零日值班-Windows-x64.zip    ← 可直接发给别人

$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
Set-Location $root

$pythonExe = "py"
$pythonArgs = @("-3.10")

Write-Host "== 检查 Python / PyInstaller ==" -ForegroundColor Cyan
& $pythonExe @pythonArgs -c "import sys, pygame, PyInstaller; print('Python', sys.version.split()[0]); print('pygame', pygame.version.ver); print('PyInstaller', PyInstaller.__version__)"
if ($LASTEXITCODE -ne 0) {
    throw "缺少依赖，请先执行：py -3.10 -m pip install pygame pyinstaller pillow"
}

Write-Host "== 生成应用图标 ==" -ForegroundColor Cyan
& $pythonExe @pythonArgs "packaging\make_icon.py"
if ($LASTEXITCODE -ne 0) { throw "图标生成失败" }

$iconIco = Join-Path $root "assets\icon.ico"
$iconPng = Join-Path $root "assets\icon.png"
$dataDir = Join-Path $root "data"
$mainFile = Join-Path $root "main.py"
$versionFile = Join-Path $root "packaging\version_info.txt"
$readmeFile = Join-Path $root "packaging\portable_readme.txt"
$distRoot = Join-Path $root "dist"
$workDir = Join-Path $root "build\pyinstaller"
$specDir = Join-Path $root "build"

foreach ($path in @($iconIco, $iconPng, $dataDir, $mainFile, $versionFile, $readmeFile)) {
    if (-not (Test-Path $path)) { throw "缺少打包所需文件：$path" }
}

Write-Host "== 清理旧的构建产物 ==" -ForegroundColor Cyan
foreach ($path in @($distRoot, $workDir, $specDir)) {
    if (Test-Path $path) { Remove-Item -Recurse -Force $path }
}

Write-Host "== PyInstaller 打包（单文件、无控制台） ==" -ForegroundColor Cyan
$dataArg = "$dataDir;data"
$iconArg = "$iconPng;assets"
& $pythonExe @pythonArgs -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --windowed `
    --name "ZeroDayDuty" `
    --icon $iconIco `
    --add-data $dataArg `
    --add-data $iconArg `
    --version-file $versionFile `
    --exclude-module numpy `
    --exclude-module scipy `
    --exclude-module pandas `
    --exclude-module matplotlib `
    --exclude-module tkinter `
    --distpath $distRoot `
    --workpath $workDir `
    --specpath $specDir `
    $mainFile
if ($LASTEXITCODE -ne 0) { throw "PyInstaller 打包失败" }

$builtExe = Join-Path $distRoot "ZeroDayDuty.exe"
if (-not (Test-Path $builtExe)) { throw "没有找到 PyInstaller 输出：$builtExe" }

Write-Host "== 组装便携文件夹 ==" -ForegroundColor Cyan
$appDir = Join-Path $distRoot "零日值班"
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
$finalExe = Join-Path $appDir "零日值班.exe"
Copy-Item $builtExe $finalExe -Force
Copy-Item $readmeFile (Join-Path $appDir "使用说明.txt") -Force

$saveDir = Join-Path $appDir "saves"
New-Item -ItemType Directory -Force -Path $saveDir | Out-Null
Copy-Item (Join-Path $root "saves\README.txt") (Join-Path $saveDir "README.txt") -Force

Write-Host "== 运行 exe 自检（--selftest） ==" -ForegroundColor Cyan
$process = Start-Process -FilePath $finalExe -ArgumentList "--selftest" -Wait -PassThru -WindowStyle Hidden
Write-Host "自检退出码：$($process.ExitCode)"
if ($process.ExitCode -ne 0) {
    throw "打包后的 exe 自检失败，请检查 error.log 或重新打包"
}

Write-Host "== 生成 zip ==" -ForegroundColor Cyan
$zipPath = Join-Path $distRoot "零日值班-Windows-x64.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $appDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

$exeSize = [math]::Round((Get-Item $finalExe).Length / 1MB, 1)
$zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
$hash = (Get-FileHash $finalExe -Algorithm SHA256).Hash

Write-Host ""
Write-Host "打包完成" -ForegroundColor Green
Write-Host "  可执行文件：$finalExe"
Write-Host "  大小：$exeSize MB"
Write-Host "  压缩包：$zipPath（$zipSize MB）"
Write-Host "  SHA256：$hash"
Write-Host ""
Write-Host "分发时把整个“零日值班”文件夹或 zip 发给对方即可。" -ForegroundColor Yellow
Write-Host "首次运行可能被 SmartScreen 拦截：更多信息 → 仍要运行。" -ForegroundColor Yellow
