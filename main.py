# -*- coding: utf-8 -*-
"""《零日值班：网络安全防御模拟器》程序入口。

用法：
    python main.py
    python main.py --seed 2024
    python main.py --selftest        # 打包后自检：无窗口运行一帧后退出
"""

from __future__ import annotations

import argparse
import os
import sys
import traceback

os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")

SELFTEST = False


def _log(message: str) -> None:
    """窗口模式下 sys.stdout 可能为 None，这里做一次保护。"""
    stream = getattr(sys, "stdout", None)
    if stream is None:
        return
    try:
        print(message, file=stream)
    except Exception:
        pass


def _show_message_box(title: str, text: str, *, quiet: bool = False) -> None:
    """在 Windows 上弹出系统提示框；其他平台退回控制台输出。"""
    _log(f"[{title}] {text}")
    if quiet:
        return
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, text, title, 0x10)
    except Exception:
        # 非 Windows 或调用失败时，控制台输出已经给出信息
        pass


def _write_error_log(text: str) -> str:
    """把异常写入 exe 旁的 error.log，方便没有控制台的窗口程序排查。"""
    try:
        import settings

        path = settings.APP_DIR / "error.log"
        path.write_text(text, encoding="utf-8")
        return str(path)
    except Exception:
        return ""


def main(argv: list[str] | None = None) -> int:
    global SELFTEST
    parser = argparse.ArgumentParser(
        description="零日值班：网络安全防御模拟器（课程演示，所有数据均为虚构）"
    )
    parser.add_argument("--seed", type=int, default=None, help="固定随机种子，便于复现同一局")
    parser.add_argument(
        "--selftest",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    args = parser.parse_args(argv)
    SELFTEST = bool(args.selftest)

    # 打包后的自检使用无窗口驱动，避免在 CI / 无桌面环境里卡住
    if SELFTEST:
        os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
        os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

    try:
        import pygame
    except ImportError:
        _show_message_box(
            "缺少依赖",
            "未安装 pygame。\n请在命令行执行：\npython -m pip install pygame",
            quiet=SELFTEST,
        )
        return 1

    import settings
    from ui import draw_utils

    # ------------------------------------------------------------------
    # 中文字体：找不到时给出明确提示，但仍允许进入游戏
    # ------------------------------------------------------------------
    font_path = None
    try:
        font_path = settings.find_chinese_font()
    except Exception:
        font_path = None
    draw_utils.set_font_path(font_path)
    if font_path is None:
        _show_message_box(
            "未找到中文字体",
            "没有在 Windows 字体目录中找到微软雅黑、黑体或宋体。\n"
            "游戏仍会启动，但中文可能显示为方块。\n\n"
            "解决方法：安装“微软雅黑”字体，或把任意中文字体复制到\n"
            "C:\\Windows\\Fonts 目录后再运行。",
            quiet=SELFTEST,
        )
    else:
        _log(f"[字体] 使用中文字体：{font_path}")

    pygame.init()
    pygame.display.set_caption(f"{settings.GAME_TITLE} {settings.GAME_VERSION}")
    icon_path = settings.ASSET_DIR / "icon.png"
    if icon_path.is_file():
        try:
            pygame.display.set_icon(pygame.image.load(str(icon_path)))
        except (pygame.error, OSError):
            pass

    try:
        screen = pygame.display.set_mode(settings.SCREEN_SIZE)
    except pygame.error as exc:
        _show_message_box(
            "无法创建游戏窗口",
            f"创建 1280×720 窗口失败：\n{exc}",
            quiet=SELFTEST,
        )
        pygame.quit()
        return 1

    try:
        from game import Game

        game = Game(screen, seed=args.seed)
        if SELFTEST:
            game.new_game()
            game.update(0.016)
            game.draw()
            game.tutorial_screen.open()
            game.draw()
            game.briefing.open()
            game.draw()
            _log(
                "[自检] 通过："
                f"回合={game.turn}，设备={len(game.devices)}，"
                f"服务={len(game.services.views(game.devices))}，"
                f"事件={len(game.events.events)}，告警={len(game.events.alerts)}，"
                f"日志={len(game.logs.entries)}，教程页={len(game.tutorial_screen.buttons)}"
            )
            return 0
        game.run()
    except settings.DataError as exc:
        _show_message_box("数据文件错误", str(exc), quiet=SELFTEST)
        return 1
    except Exception:
        detail = traceback.format_exc()
        _log(detail)
        log_path = _write_error_log(detail)
        hint = f"\n\n错误详情已写入：\n{log_path}" if log_path else ""
        _show_message_box(
            "程序错误",
            "程序发生未预期错误，已尝试安全退出。" + hint,
            quiet=SELFTEST,
        )
        return 1
    finally:
        pygame.quit()
    return 0


if __name__ == "__main__":
    sys.exit(main())
