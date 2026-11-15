# Steamworks 运行库（可选）

把 Steamworks SDK 里的 **`steam_api64.dll`** 放到这个目录（`steam/redist/`）：

```
steam/redist/steam_api64.dll
```

来源：<https://partner.steamgames.com/downloads/list> → Steamworks SDK →
`sdk/redistributable_bin/win64/steam_api64.dll`

`build_exe.ps1` 检测到这个文件时会自动 `--add-binary` 打进 exe 同级目录；
没有它也能正常打包，只是成就上报会被静默跳过（`steam_bridge` 会退化成空操作）。

## 本地调试

在**被打包出来的程序目录**（或源码根目录）放一个 `steam_appid.txt`，内容就是 AppID：

```
1234560
```

这样 `steam_bridge.init()` 才能拿到 AppID 初始化 Steamworks。

- 本地调试：需要它
- 正式 depot：**不要带**（`steam/build/depot_build.vdf` 已把它排除）

也可以改用环境变量 `STEAM_APP_ID`，不用写文件。

> SDK 自身有许可限制，不建议把 `steam_api64.dll` 提交进仓库；
> 这个目录默认只放这一个 README，dll 由你自己放。
