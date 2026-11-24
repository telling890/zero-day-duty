# 桌面便携版（Electron）

单文件 exe，自带 Chromium；目标电脑不需要 Python、不需要 WebView2、不需要联网。

- 入口：`main.js`
- 配置：`package.json`
- 构建：`powershell -ExecutionPolicy Bypass -File .\build_portable.ps1`
- 产物：`..\dist\ZeroDayDuty.exe`（约 105 MB）

它直接加载 `web/` 里的网页版 UI，所以终端、自动化剧本、生活线、教程和主题与网页版完全一致；
网页版更新后重新跑一次构建脚本即可。
