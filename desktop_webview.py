# -*- coding: utf-8 -*-
"""零日值班 · 桌面完整版（WebView2 原生窗口）。

直接用和网页版同一套 UI：处置终端、自动化剧本、生活线、教程、主题全部一致。
本地起一个只读静态服务，窗口只显示游戏界面，不经过浏览器地址栏。
"""
from __future__ import annotations

import functools
import http.server
import os
import sys
import threading
import time
import urllib.request
from pathlib import Path

APP_TITLE = "零日值班：网络安全防御模拟器 v1.9.0"
DEFAULT_PORT = 8123


def bundle_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent


def web_dir() -> Path:
    return bundle_dir() / "web"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map)
    extensions_map[".webmanifest"] = "application/manifest+json"
    extensions_map[".js"] = "text/javascript"
    extensions_map[".css"] = "text/css"

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class LocalServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def serve(port: int) -> LocalServer:
    handler = functools.partial(QuietHandler, directory=str(web_dir()))
    server = LocalServer(("127.0.0.1", port), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def looks_like_game(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/index.html", timeout=1.2) as response:
            html = response.read(8192).decode("utf-8", "ignore")
        return "零日值班" in html
    except Exception:
        return False


def selftest() -> int:
    required = ["index.html", "js/ui/terminal.js", "js/ui/script.js", "js/core/zscript.js", "js/data/game-data.js"]
    missing = [name for name in required if not (web_dir() / name).is_file()]
    if missing:
        print("missing:", ", ".join(missing))
        return 1
    server = serve(0)
    port = server.server_address[1]
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/index.html", timeout=3) as response:
            html = response.read().decode("utf-8", "ignore")
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/js/data/game-data.js", timeout=3) as response:
            data = response.read().decode("utf-8", "ignore")
    finally:
        server.shutdown()
        server.server_close()
    checks = [
        ("终端入口", "btn-terminal" in html),
        ("脚本入口", "btn-script" in html),
        ("生活线数据", '"kind":"life"' in data),
    ]
    for name, ok in checks:
        print(("OK  " if ok else "FAIL") + " " + name)
    return 0 if all(ok for _, ok in checks) else 1


def start_game_window(url: str) -> None:
    import webview

    window = webview.create_window(
        APP_TITLE,
        url,
        width=1280,
        height=820,
        min_size=(960, 600),
        background_color="#080d14",
    )
    webview.start(
        private_mode=False,
        storage_path=str(Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "ZeroDayDuty" / "webview"),
        icon=str(bundle_dir() / "assets" / "icon.png"),
    )
    _ = window


def main() -> int:
    args = sys.argv[1:]
    if "--selftest" in args:
        return selftest()

    port = DEFAULT_PORT
    server: LocalServer | None = None
    if "--port" in args:
        try:
            port = int(args[args.index("--port") + 1])
        except (IndexError, ValueError):
            port = DEFAULT_PORT

    if port == DEFAULT_PORT and looks_like_game(port):
        url = f"http://127.0.0.1:{port}/"
    else:
        try:
            server = serve(port)
            url = f"http://127.0.0.1:{port}/"
        except OSError:
            for candidate in range(port + 1, port + 20):
                try:
                    server = serve(candidate)
                    url = f"http://127.0.0.1:{candidate}/"
                    break
                except OSError:
                    continue
            else:
                server = serve(0)
                url = f"http://127.0.0.1:{server.server_address[1]}/"

    if "--window-selftest" in args:
        import webview

        window = webview.create_window(APP_TITLE, url, width=900, height=600)
        def close_later() -> None:
            time.sleep(2)
            window.destroy()
        webview.start(close_later, private_mode=False)
        if server is not None:
            server.shutdown()
            server.server_close()
        print("window ok", flush=True)
        return 0

    start_game_window(url)
    if server is not None:
        server.shutdown()
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
